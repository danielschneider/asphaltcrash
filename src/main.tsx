import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/global.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}

const preventZoomGesture = (event: Event): void => {
  event.preventDefault();
};
document.addEventListener("gesturestart", preventZoomGesture, {
  passive: false,
});
document.addEventListener("gesturechange", preventZoomGesture, {
  passive: false,
});
document.addEventListener("gestureend", preventZoomGesture, { passive: false });
document.addEventListener(
  "touchmove",
  (event: TouchEvent): void => {
    if (event.touches.length > 1) {
      event.preventDefault();
    }
  },
  { passive: false },
);

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
