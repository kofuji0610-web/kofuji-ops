export function parseYmdToDate(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map((v) => Number(v));
  return new Date(year, month - 1, day);
}

export function getTodayJstYmd(): string {
  const now = new Date();
  const jst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const y = jst.getFullYear();
  const m = String(jst.getMonth() + 1).padStart(2, "0");
  const d = String(jst.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
