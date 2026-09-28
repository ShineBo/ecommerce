import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api';
const ShopContext = createContext(null);
export function ShopProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [cart, setCart] = useState(null);
  const [notice, setNotice] = useState('');
  const refreshCart = useCallback(async () => {
    const result = await api('/cart');
    setCart(result.data);
    return result.data;
  }, []);
  const loadSession = useCallback(async () => {
    setLoading(true);
    setAuthError('');
    try {
      setUser((await api('/auth/me')).data);
    } catch (error) {
      if (error.status !== 401) setAuthError(error.message);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    loadSession();
  }, [loadSession]);
  useEffect(() => {
    if (user) refreshCart().catch((error) => setNotice(error.message));
    else setCart(null);
  }, [user, refreshCart]);
  useEffect(() => {
    const expire = () => {
      setUser(null);
      setCart(null);
      setNotice('Your session expired. Please sign in again.');
    };
    window.addEventListener('session-expired', expire);
    return () => window.removeEventListener('session-expired', expire);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  const authenticate = async (mode, values) => {
    const response = await api(`/auth/${mode}`, { method: 'POST', body: values });
    setUser(response.data.user);
  };
  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (error) {
      if (error.status !== 401) throw error;
    }
    setUser(null);
    setCart(null);
  };
  const updateCart = async (url, method, body) => {
    try {
      const response = await api(url, { method, body });
      setCart(response.data);
      return response.data;
    } catch (error) {
      if (error.status === 409) await refreshCart();
      throw error;
    }
  };
  return (
    <ShopContext.Provider
      value={{
        user,
        loading,
        authError,
        loadSession,
        cart,
        refreshCart,
        authenticate,
        logout,
        updateCart,
        notice,
        setNotice,
      }}
    >
      {children}
    </ShopContext.Provider>
  );
}
export const useShop = () => useContext(ShopContext);
