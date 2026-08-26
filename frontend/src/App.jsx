import { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import lazyWithReload from './lib/lazyWithReload.js';

// Páginas carregadas sob demanda — cada rota vira um chunk separado, então o
// bundle inicial não carrega o Admin (pesado) nem telas que o usuário pode
// nunca abrir. Login fica eager por ser o primeiro paint do deslogado.
//
// lazyWithReload (e não o `lazy` puro): depois de um deploy os chunks antigos
// deixam de existir, e uma aba já aberta travaria no spinner do Suspense.
const Signup = lazyWithReload(() => import('./pages/Signup.jsx'));
const ForgotPassword = lazyWithReload(() => import('./pages/ForgotPassword.jsx'));
const ResetPassword = lazyWithReload(() => import('./pages/ResetPassword.jsx'));
const Dashboard = lazyWithReload(() => import('./pages/Dashboard.jsx'));
const Applications = lazyWithReload(() => import('./pages/Applications.jsx'));
const Profile = lazyWithReload(() => import('./pages/Profile.jsx'));
const Feedback = lazyWithReload(() => import('./pages/Feedback.jsx'));
const Subscription = lazyWithReload(() => import('./pages/Subscription.jsx'));
const Admin = lazyWithReload(() => import('./pages/Admin.jsx'));

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
