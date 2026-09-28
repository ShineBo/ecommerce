import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShopProvider, useShop } from './context/ShopContext';
import Layout from './components/Layout';
import { Loading, ErrorMessage, EmptyState } from './components/UI';
import Auth from './pages/Auth';
import Products from './pages/Products';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import { Orders, OrderDetail } from './pages/Orders';
import './styles.css';
function Protected() {
  const { loading, user, authError, loadSession } = useShop();
  const location = useLocation();
  if (loading) return <Loading />;
  if (authError)
    return (
      <div className="container page-container">
        <ErrorMessage error={authError} />
        <button className="button" onClick={loadSession}>
          Try again
        </button>
      </div>
    );
  return user ? <Outlet /> : <Navigate to="/login" state={{ from: location.pathname }} replace />;
}
function App() {
  return (
    <BrowserRouter>
      <ShopProvider>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Routes>
          <Route path="/login" element={<Auth key="login" />} />
          <Route path="/register" element={<Auth key="register" register />} />
          <Route element={<Protected />}>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/products" replace />} />
              <Route path="/products" element={<Products />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/orders/:id" element={<OrderDetail />} />
              <Route
                path="*"
                element={
                  <EmptyState
                    title="This little corner is empty."
                    text="We couldn’t find that page. Let’s take you back to the collection."
                  />
                }
              />
            </Route>
          </Route>
        </Routes>
      </ShopProvider>
    </BrowserRouter>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
