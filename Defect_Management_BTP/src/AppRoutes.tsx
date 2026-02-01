// src/AppRoutes.tsx
import { Routes, Route } from 'react-router-dom';

import { MyApp } from './pages/MyApp';
import Defect_Management_BTM_INT from './pages/Defect_Management_BTM_INT/Defect_Management_BTM_INT';
import Defect_Management_BTM_ENT from './pages/Defect_Management_BTM_ENT/Defect_Management_BTM_ENT'
import Defect_Management_Lean_Line_INT from './pages/Defect_Management_Lean_Line_INT/Defect_Management_Lean_Line_INT'
import Defect_Management_Lean_Line_ENT from './pages/Defect_Management_Lean_Line_ENT/Defect_Management_Lean_Line_ENT'
import Defect_Management_VJ2_VJ3_INT from './pages/Defect_Management_VJ2_VJ3_INT/Defect_Management_VJ2_VJ3_INT'
import Defect_Management_Upstream_INT from './pages/Defect_Management_Upstream_INT/Defect_Management_Upstream_INT'
import Defect_Management_Bonding from './pages/Defect_Management_Bonding/Defect_Management_Bonding'
import Defect_Management_HFPA from './pages/Defect_Management_HFPA/Defect_Management_HFPA';
import Return_Management_Main from './pages/Return_Management_Main/Return_Management_Main'
import ScrapRework_Management_Main from './pages/ScrapRework_Management_Main/ScrapRework_Management_Main'
import DbTest from './pages/DBdataTest'

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<MyApp />} />
      <Route path="/defect/btm-int" element={<Defect_Management_BTM_INT />} />
      <Route path="/defect/btm-ent" element={< Defect_Management_BTM_ENT />} />
      <Route path="/defect/lean-line-int" element={< Defect_Management_Lean_Line_INT />} />
      <Route path="/defect/lean-line-ent" element={< Defect_Management_Lean_Line_ENT />} />
      <Route path="/defect/VJ2_VJ3-int" element={< Defect_Management_VJ2_VJ3_INT />} />
      <Route path="/defect/upstream-int" element={< Defect_Management_Upstream_INT />} />
      <Route path="/defect/bonding" element={< Defect_Management_Bonding />} />
      <Route path="/defect/hfpa" element={< Defect_Management_HFPA />} />
      <Route path="/return" element={< Return_Management_Main />} />
      <Route path="/scrap-rework" element={< ScrapRework_Management_Main />} />
      <Route path="/dbtest" element={<DbTest />} />
    </Routes>
  );
};

export default AppRoutes;
