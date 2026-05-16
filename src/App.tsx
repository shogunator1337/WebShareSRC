/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import AdminPanel from "./components/AdminPanel";
import Broadcaster from "./components/Broadcaster";
import Viewer from "./components/Viewer";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AdminPanel />} />
        <Route path="/stream/:roomId" element={<Broadcaster />} />
        <Route path="/view/:roomId" element={<Viewer />} />
      </Routes>
    </BrowserRouter>
  );
}
