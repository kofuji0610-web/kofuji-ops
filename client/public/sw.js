self.addEventListener("push", (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title ?? "通知";
  const body = data.body ?? "";
  e.waitUntil(self.registration.showNotification(title, { body }));
});
