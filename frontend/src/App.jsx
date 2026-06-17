import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';

// Páginas carregadas sob demanda — cada rota vira um chunk separado, então o
// bundle inicial não carrega o Admin (pesado) nem telas que o usuário pode
// nunca abrir. Login fica eager por ser o primeiro paint do deslogado.
const Signup = lazy(() => import('./pages/Signup.jsx'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Applications = lazy(() => import('./pages/Applications.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Feedback = lazy(() => import('./pages/Feedback.jsx'));
const Subscription = lazy(() => import('./pages/Subscription.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));

function PageFallback() {
    return <div className="center" style={{ minHeight: '60vh' }}><div className="spinner" /></div>;
}

export default function App() {
    return (
        <Suspense fallback={<PageFallback />}>
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
        </Suspense>
    );
}
