import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Leaf, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { Logo, Field, ErrorMessage, Loading } from '../components/UI';
export default function Auth({ register = false }) {
  const { user, authenticate, loading } = useShop();
  const location = useLocation();
  const navigate = useNavigate();
  const [values, setValues] = useState({ name: '', email: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [visible, setVisible] = useState(false);
  const destination =
    location.state?.from?.startsWith('/') && !location.state.from.startsWith('//')
      ? location.state.from
      : '/products';
  if (loading) return <Loading />;
  if (user) return <Navigate to={destination} replace />;
  const set = (event) => setValues({ ...values, [event.target.name]: event.target.value });
  async function submit(event) {
    event.preventDefault();
    setError(null);
    if (register && values.password !== values.confirm) {
      setError(new Error('Your passwords do not match.'));
      return;
    }
    setBusy(true);
    try {
      await authenticate(
        register ? 'register' : 'login',
        register
          ? { name: values.name, email: values.email, password: values.password }
          : { email: values.email, password: values.password },
      );
      navigate(destination, { replace: true });
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-story">
        <Logo />
        <div className="auth-story-content">
          <span className="eyebrow">
            <Leaf size={14} /> THOUGHTFULLY CHOSEN, SIMPLY YOURS
          </span>
          <h1>
            Little things.
            <br />
            <em>Lovely everyday.</em>
          </h1>
          <p>
            For the lists you’ll make, the ideas you’ll have,
            <br className="desktop-break" /> and all the small moments in between.
          </p>
          <img
            className="auth-illustration"
            src="/desk-scene.svg"
            alt="A notebook, cup, and stationery on a sunlit desk"
          />
          <div className="auth-caption">
            <span className="small-flower">✳</span> Everyday essentials, with a little personality.
          </div>
        </div>
        <small>© {new Date().getFullYear()} Simple Shop</small>
      </section>
      <section className="auth-form-side">
        <div className="auth-mobile-logo">
          <Logo />
        </div>
        <div className="auth-form-wrap">
          <span className="eyebrow">YOUR LITTLE CORNER OF THE SHOP</span>
          <h2>{register ? 'Make yourself at home.' : 'Lovely to see you again.'}</h2>
          <p className="muted">
            {register
              ? 'Create an account and find your everyday favorites.'
              : 'Sign in to discover your next everyday favorite.'}
          </p>
          <form onSubmit={submit}>
            <ErrorMessage error={error} />
            {register && (
              <Field
                label="Your name"
                name="name"
                autoComplete="name"
                placeholder="Jamie Lee"
                value={values.name}
                onChange={set}
                required
                minLength={2}
                maxLength={80}
                error={error?.details?.fields?.name}
              />
            )}
            <Field
              label="Email address"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={values.email}
              onChange={set}
              required
              maxLength={254}
              error={error?.details?.fields?.email}
            />
            <div className="password-field">
              <Field
                label="Password"
                name="password"
                type={visible ? 'text' : 'password'}
                autoComplete={register ? 'new-password' : 'current-password'}
                placeholder={register ? 'At least 12 characters' : 'Your password'}
                value={values.password}
                onChange={set}
                required
                minLength={register ? 12 : 1}
                maxLength={128}
                error={error?.details?.fields?.password}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setVisible(!visible)}
                aria-label={visible ? 'Hide password' : 'Show password'}
              >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {register && (
              <Field
                label="Confirm password"
                name="confirm"
                type="password"
                autoComplete="new-password"
                placeholder="One more time"
                value={values.confirm}
                onChange={set}
                required
                maxLength={128}
              />
            )}
            <button className="button full" disabled={busy}>
              {busy ? 'Just a moment…' : register ? 'Create my account' : 'Sign in'}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="auth-switch">
            {register ? 'Already part of the shop?' : 'New around here?'}{' '}
            <Link state={location.state} to={register ? '/login' : '/register'}>
              {register ? 'Sign in' : 'Create an account'}
            </Link>
          </p>
          <div className="auth-security">
            <ShieldCheck size={17} />
            <span>Your own account. Your own little collection.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
