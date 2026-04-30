import { Router } from "express";
import { google } from "googleapis";
import { getUserFromSession, SESSION_COOKIE } from "../lib/auth";
import { createOAuthState, parseOAuthState } from "../lib/oauthState";
import { upsertCalendarIntegration } from "../db/scheduleQueries";

const router = Router();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const clientUrl = () => process.env.CLIENT_URL ?? "http://localhost:5173";

router.get("/google/calendar", async (req, res) => {
  const sid = req.cookies?.[SESSION_COOKIE] ?? "";
  const user = await getUserFromSession(sid);
  if (!user) {
    res.status(401).send("ログインが必要です");
    return;
  }
  const state = createOAuthState(user.id);
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar"],
    state,
  });
  res.redirect(url);
});

router.get("/google/callback", async (req, res) => {
  try {
    const code = req.query.code;
    const state = req.query.state;
    if (typeof code !== "string" || typeof state !== "string") {
      res.redirect(`${clientUrl()}/schedule?calendarError=missing`);
      return;
    }
    const userId = parseOAuthState(state);
    if (!userId) {
      res.redirect(`${clientUrl()}/schedule?calendarError=state`);
      return;
    }
    const { tokens } = await oauth2Client.getToken(code);
    const exp = tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString().slice(0, 19).replace("T", " ")
      : null;
    await upsertCalendarIntegration({
      userId,
      provider: "google",
      externalCalendarId: null,
      accessToken: tokens.access_token ?? null,
      refreshToken: tokens.refresh_token ?? null,
      tokenExpiresAt: exp,
      syncEnabled: true,
    });
    res.redirect(`${clientUrl()}/schedule?calendarConnected=google`);
  } catch (e) {
    console.error("Google OAuth callback error:", e);
    res.redirect(`${clientUrl()}/schedule?calendarError=google`);
  }
});

router.get("/microsoft/calendar", async (req, res) => {
  const sid = req.cookies?.[SESSION_COOKIE] ?? "";
  const user = await getUserFromSession(sid);
  if (!user) {
    res.status(401).send("ログインが必要です");
    return;
  }
  const state = createOAuthState(user.id);
  const tenant = process.env.MICROSOFT_TENANT_ID ?? "common";
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI ?? "";
  const clientId = process.env.MICROSOFT_CLIENT_ID ?? "";
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "Calendars.ReadWrite offline_access",
    state,
  });
  res.redirect(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`);
});

router.get("/microsoft/callback", async (req, res) => {
  try {
    const code = req.query.code;
    const state = req.query.state;
    if (typeof code !== "string" || typeof state !== "string") {
      res.redirect(`${clientUrl()}/schedule?calendarError=missing`);
      return;
    }
    const userId = parseOAuthState(state);
    if (!userId) {
      res.redirect(`${clientUrl()}/schedule?calendarError=state`);
      return;
    }
    const tenant = process.env.MICROSOFT_TENANT_ID ?? "common";
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
        client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
        code,
        redirect_uri: process.env.MICROSOFT_REDIRECT_URI ?? "",
        grant_type: "authorization_code",
      }),
    });
    const tokens = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!tokens.access_token) {
      console.error("Microsoft token error:", tokens);
      res.redirect(`${clientUrl()}/schedule?calendarError=microsoft_token`);
      return;
    }
    const exp = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString().slice(0, 19).replace("T", " ")
      : null;
    await upsertCalendarIntegration({
      userId,
      provider: "outlook",
      externalCalendarId: null,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      tokenExpiresAt: exp,
      syncEnabled: true,
    });
    res.redirect(`${clientUrl()}/schedule?calendarConnected=microsoft`);
  } catch (e) {
    console.error("Microsoft OAuth callback error:", e);
    res.redirect(`${clientUrl()}/schedule?calendarError=microsoft`);
  }
});

export default router;
