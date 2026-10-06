import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./AuthContext.jsx";
import { ToastProvider } from "./components/ToastProvider.jsx";
import App from "./App.jsx";
import "./index.css";
import "./ux.css";
import "./course-coach-theme.css";
import "./file-preview.css";
import "./profile-redesign.css";
import "./toast.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider><App /></ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
