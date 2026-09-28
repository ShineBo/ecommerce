import { Link } from 'react-router-dom';
import { ArrowRight, Flower2, ShoppingBag, LoaderCircle } from 'lucide-react';
export function Logo() {
  return (
    <Link className="logo" to="/">
      <span className="logo-mark">
        <Flower2 size={23} strokeWidth={1.6} />
      </span>
      <span>
        simple<span className="logo-light">shop</span>
        <span className="logo-dot">.</span>
      </span>
    </Link>
  );
}
export function Loading({ text = 'Getting things ready…' }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} />
      {text}
    </div>
  );
}
export function ErrorMessage({ error }) {
  return error ? (
    <div className="error-message" role="alert">
      {typeof error === 'string' ? error : error.message}
    </div>
  ) : null;
}
export function EmptyState({ title, text, button = 'Explore the collection', to = '/products' }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <ShoppingBag size={36} strokeWidth={1.2} />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
      <Link className="button" to={to}>
        {button}
        <ArrowRight size={16} />
      </Link>
    </div>
  );
}
const statuses = {
  PENDING_REVIEW: ['pending', 'Awaiting review'],
  CONFIRMED: ['confirmed', 'Payment confirmed'],
  REJECTED: ['rejected', 'Payment rejected'],
};
export function Status({ value }) {
  const [style, label] = statuses[value] || ['', value];
  return (
    <span className={`status ${style}`}>
      <span />
      {label}
    </span>
  );
}
export function Field({ label, error, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        {...props}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${props.name}-error` : undefined}
      />
      {error && (
        <small id={`${props.name}-error`} className="field-error">
          {error}
        </small>
      )}
    </label>
  );
}
