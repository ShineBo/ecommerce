import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Upload, Check, ShieldCheck, Image, Building2 } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { api, money } from '../api';
import { ErrorMessage, Loading, EmptyState } from '../components/UI';
export default function Checkout() {
  const { cart, refreshCart, user, setNotice } = useShop();
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([api('/checkout/config'), refreshCart()])
      .then(([result]) => {
        if (active) {
          setConfig(result.data);
          setReady(true);
        }
      })
      .catch((error) => {
        if (active) setError(error);
      });
    return () => {
      active = false;
    };
  }, [refreshCart]);
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const storageName = cart && `checkout:${user.id}:${cart.version}:${cart.totalMinor}`;
  function selectFile(event) {
    const selected = event.target.files?.[0];
    setError(null);
    if (!selected) return;
    if (
      !['image/jpeg', 'image/png'].includes(selected.type) ||
      selected.size > config.maxSlipBytes
    ) {
      setError(new Error('Choose a PNG or JPEG image no larger than 5 MiB.'));
      event.target.value = '';
      return;
    }
    if (storageName) sessionStorage.removeItem(storageName);
    setFile(selected);
  }
  async function submit(event) {
    event.preventDefault();
    setError(null);
    if (!file) {
      setError(new Error('Choose a payment slip to continue.'));
      return;
    }
    setBusy(true);
    const key = sessionStorage.getItem(storageName) || crypto.randomUUID();
    sessionStorage.setItem(storageName, key);
    const body = new FormData();
    body.append('cartVersion', String(cart.version));
    body.append('expectedTotalMinor', String(cart.totalMinor));
    body.append('slip', file);
    try {
      const result = await api('/orders', {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': key },
      });
      sessionStorage.removeItem(storageName);
      if (result.meta.cartChanged)
        setNotice('Order saved. Your bag has newer changes; please review it.');
      await refreshCart().catch(() => {});
      navigate(`/orders/${result.data.id}`, { replace: true, state: { submitted: true } });
    } catch (error) {
      setError(error);
      if (error.status === 409 && !error.details?.orderId) await refreshCart().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container page-container">
      <Link className="back-link" to="/cart">
        <ArrowLeft size={15} /> Back to your bag
      </Link>
      <div className="page-heading">
        <span className="eyebrow">ONE LAST LITTLE STEP</span>
        <h1>
          Make them <em>yours.</em>
        </h1>
        <p className="muted">Review your order and upload your payment slip.</p>
      </div>
      <ErrorMessage error={error} />
      {error?.details?.orderId && (
        <Link className="button secondary" to={`/orders/${error.details.orderId}`}>
          View your existing order <ArrowRight size={16} />
        </Link>
      )}
      {!ready ? (
        !error && <Loading />
      ) : !cart?.items.length ? (
        <EmptyState
          title="Your bag needs a little something."
          text="Choose a few favorites before checking out."
        />
      ) : (
        <form className="two-column" onSubmit={submit}>
          <div className="checkout-sections">
            <section className="checkout-card">
              <div className="step-heading">
                <span className="step-number">01</span>
                <div>
                  <h2>Bank transfer</h2>
                  <p className="muted">
                    {config.demoMode
                      ? 'Try the flow with a sample payment slip.'
                      : 'Transfer the exact total to the account below.'}
                  </p>
                </div>
                <Building2 size={21} />
              </div>
              {config.demoMode && (
                <div className="demo-banner">
                  <strong>You’re in our demo shop.</strong> No real transfer is needed. Use the
                  sample slip below.
                </div>
              )}
              <dl className="bank-details">
                <div>
                  <dt>Bank</dt>
                  <dd>{config.bank.name}</dd>
                </div>
                <div>
                  <dt>Account name</dt>
                  <dd>{config.bank.accountName}</dd>
                </div>
                <div>
                  <dt>Account number</dt>
                  <dd className="account-number">{config.bank.accountNumber}</dd>
                </div>
                <div>
                  <dt>Transfer amount</dt>
                  <dd className="transfer-total">{money(cart.totalMinor, cart.currency)}</dd>
                </div>
              </dl>
            </section>
            <section className="checkout-card">
              <div className="step-heading">
                <span className="step-number">02</span>
                <div>
                  <h2>Your payment slip</h2>
                  <p className="muted">One PNG or JPEG image, up to 5 MiB.</p>
                </div>
                <Image size={21} />
              </div>
              <label className={`upload-box ${file ? 'has-file' : ''}`}>
                <input
                  type="file"
                  name="slip"
                  accept="image/png,image/jpeg"
                  onChange={selectFile}
                  disabled={busy}
                  aria-label="Payment slip"
                />
                {preview ? (
                  <img className="slip-preview" src={preview} alt="Selected payment slip preview" />
                ) : (
                  <span className="upload-icon">
                    <Upload size={25} strokeWidth={1.5} />
                  </span>
                )}
                <strong>{file ? file.name : 'Choose your payment slip'}</strong>
                <span>
                  {file ? 'Click to choose a different image' : 'Click to browse your files'}
                </span>
                {file && (
                  <small>
                    <Check size={14} /> Ready to submit
                  </small>
                )}
              </label>
              {config.demoMode && (
                <a className="sample-link" href="/demo/sample-slip.png" download="sample-slip.png">
                  Download a sample slip <ArrowRight size={14} />
                </a>
              )}
            </section>
          </div>
          <aside className="summary-card">
            <span className="eyebrow">YOUR LOVELY FINDS</span>
            <h2>Order summary</h2>
            <div className="mini-items">
              {cart.items.map((item) => (
                <div key={item.productId}>
                  <img src={item.imagePath} alt="" />
                  <span>
                    {item.name}
                    <small>Qty {item.quantity}</small>
                  </span>
                  <strong>{money(item.lineTotalMinor, cart.currency)}</strong>
                </div>
              ))}
            </div>
            <div className="summary-total">
              <span>Total</span>
              <strong>{money(cart.totalMinor, cart.currency)}</strong>
            </div>
            <p className="small muted">Bank transfer · {cart.currency}</p>
            {!cart.canCheckout && (
              <ErrorMessage error="Remove unavailable items from your bag before submitting." />
            )}
            <button className="button full" disabled={busy || !file || !cart.canCheckout}>
              {busy ? 'Submitting your order…' : 'Submit my order'}
              <ArrowRight size={16} />
            </button>
            <div className="assurance">
              <ShieldCheck size={18} />
              <span>Your slip is private. Payment is confirmed after a manual review.</span>
            </div>
          </aside>
        </form>
      )}
    </div>
  );
}
