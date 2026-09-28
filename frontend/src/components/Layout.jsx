import { NavLink, Outlet, Link } from 'react-router-dom';
import { ShoppingBag, LogOut, ArrowUpRight, Leaf, Heart } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { Logo } from './UI';
export default function Layout() {
  const { user, cart, logout, notice, setNotice } = useShop();
  return (
    <>
      <div className="announcement">
        <span>A little everyday lovely.</span>
        <span className="announcement-right">
          Thoughtfully chosen. Simply yours. <Leaf size={12} />
        </span>
      </div>
      <header className="header">
        <div className="header-inner">
          <Logo />
          <nav aria-label="Main navigation">
            <NavLink to="/products">The collection</NavLink>
            <NavLink to="/orders">My orders</NavLink>
          </nav>
          <div className="header-actions">
            <span className="greeting">
              Hi, {user?.name.split(' ')[0]} <span className="avatar">{user?.name[0]}</span>
            </span>
            <NavLink
              className="cart-link"
              to="/cart"
              aria-label={`Shopping bag, ${cart?.quantity || 0} items`}
            >
              <ShoppingBag size={20} />
              <span className="cart-count">{cart?.quantity || 0}</span>
            </NavLink>
            <button
              className="icon-button logout"
              aria-label="Sign out"
              title="Sign out"
              onClick={() => logout().catch((error) => setNotice(error.message))}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>
      <main id="main">
        <Outlet />
      </main>
      <footer className="footer">
        <div>
          <Logo />
          <p>Small things. A little more joy.</p>
        </div>
        <div className="footer-links">
          <Link to="/products">
            The collection <ArrowUpRight size={13} />
          </Link>
          <Link to="/orders">
            My orders <ArrowUpRight size={13} />
          </Link>
        </div>
        <div className="footer-note">
          <span>
            Made for your everyday <Heart size={12} />
          </span>
          <small>© {new Date().getFullYear()} Simple Shop · A student project</small>
        </div>
      </footer>
      <div className={`toast ${notice ? 'visible' : ''}`} role="status" aria-live="polite">
        {notice}
      </div>
    </>
  );
}
