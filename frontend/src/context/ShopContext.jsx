import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../api';
const ShopContext = createContext(null);
export function ShopProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [cart, setCart] = useState(null);
  const [notice, setNotice] = useState('');
  const cartEpoch = useRef(0);
  const invalidateCart = useCallback(() => {
    cartEpoch.current++;
  }, []);
  const acceptCart = useCallback((next, epoch) => {
    setCart((current) => {
      // An old read must not overwrite a newer mutation or a different login session.
      if (epoch !== cartEpoch.current) return current;
      return !current || next.version >= current.version ? next : current;
    });
  }, []);
  const refreshCart = useCallback(async () => {
    const epoch = cartEpoch.current;
    const result = await api('/cart');
    acceptCart(result.data, epoch);
    return result.data;
  }, [acceptCart]);
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
    invalidateCart();
    const epoch = cartEpoch.current;
    setCart(null);
    if (user)
      refreshCart().catch((error) => {
        if (epoch === cartEpoch.current) setNotice(error.message);
      });
    return invalidateCart;
  }, [user, refreshCart, invalidateCart]);
  useEffect(() => {
    const expire = () => {
      cartEpoch.current++;
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
    cartEpoch.current++;
    setUser(response.data.user);
  };
  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (error) {
      if (error.status !== 401) throw error;
    }
    cartEpoch.current++;
    setUser(null);
    setCart(null);
  };
  const updateCart = async (url, method, body) => {
    const epoch = cartEpoch.current;
    try {
      const response = await api(url, { method, body });
      acceptCart(response.data, epoch);
      return response.data;
    } catch (error) {
      if (error.status === 409 && epoch === cartEpoch.current) await refreshCart();
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
