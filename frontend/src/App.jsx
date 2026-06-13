import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Applications from './pages/Applications.jsx';
import Profile from './pages/Profile.jsx';
import Feedback from './pages/Feedback.jsx';
import Subscription from './pages/Subscription.jsx';
import Admin from './pages/Admin.jsx';

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot" element={<ForgotPassword />} />
            <Route path="/reset" element={<ResetPassword />} />
            <Route
                path="/app"
                element={
                    <ProtectedRoute>
                        <Layout />
                    </ProtectedRoute>
                }
            >
                <Route index element={<Dashboard />} />
                <Route path="candidaturas" element={<Applications />} />
                <Route path="feedback" element={<Feedback />} />
                <Route path="perfil" element={<Profile />} />
                <Route path="assinatura" element={<Subscription />} />
                <Route path="admin" element={<Admin />} />
                {/* compat: rotas antigas */}
                <Route path="vagas" element={<Navigate to="/app" replace />} />
                <Route path="configuracoes" element={<Navigate to="/app/perfil?tab=email" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
    );
}
