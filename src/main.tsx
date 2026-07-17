import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initDesktopDb } from "./lib/db/client";
import "./index.css";

initDesktopDb().finally(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
