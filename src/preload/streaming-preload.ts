import { ipcRenderer } from "electron";

document.addEventListener("ember:frontpage", (event) => {
  const detail = (event as CustomEvent).detail;
  if (detail && Array.isArray(detail.items) && detail.serviceId) {
    ipcRenderer.send("streaming:frontpage:report", detail.serviceId, detail.items);
  }
});

window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "ember:frontpage") {
    const { serviceId, items } = event.data;
    if (serviceId && Array.isArray(items)) {
      ipcRenderer.send("streaming:frontpage:report", serviceId, items);
    }
  }
});
