import webPush from "web-push";

const pub = process.env.VAPID_PUBLIC_KEY ?? "";
const priv = process.env.VAPID_PRIVATE_KEY ?? "";

if (pub && priv) {
  webPush.setVapidDetails(
    "mailto:" + (process.env.VAPID_EMAIL ?? "admin@example.com"),
    pub,
    priv
  );
}

export { webPush };
