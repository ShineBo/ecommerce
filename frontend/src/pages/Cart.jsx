import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Minus, Plus, Trash2, ShieldCheck } from 'lucide-react';
import { useShop } from '../context/ShopContext';
import { money } from '../api';
import StudyKitChecker from '../components/StudyKitChecker';
import { Loading, ErrorMessage, EmptyState } from '../components/UI';
export default function Cart() {
  const { cart, refreshCart, updateCart } = useShop();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    refreshCart().catch((error) => setError(error.message));
  }, [refreshCart]);
  async function change(productId, quantity) {
    setBusy(true);
    setError('');
    try {
      await updateCart(`/cart/items/${productId}`, 'PATCH', {
        quantity,
        expectedVersion: cart.version,
      });
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(productId) {
    setBusy(true);
    setError('');
    try {
      await updateCart(
        `/cart${productId ? `/items/${productId}` : ''}?expectedVersion=${cart.version}`,
        'DELETE',
      );
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="container page-container">
      <Link className="back-link" to="/products">
        <ArrowLeft size={15} /> Back to the collection
      </Link>
      <div className="page-heading">
        <span className="eyebrow">YOUR LITTLE COLLECTION</span>
        <h1>
          A bag of <em>lovely things.</em>
        </h1>
        <p className="muted">A few everyday favorites, just for you.</p>
      </div>
      <ErrorMessage error={error} />
      {!cart ? (
        !error && <Loading />
      ) : (
        <div className={cart.items.length ? 'two-column' : 'cart-empty-layout'}>
          <div className="cart-main">
            {cart.items.length ? (
              <section className="cart-panel">
                <div className="panel-title">
                  <h2>
                    Your bag <span>({cart.quantity})</span>
                  </h2>
                  <button className="text-button muted" disabled={busy} onClick={() => remove()}>
                    Clear bag
                  </button>
                </div>
                {cart.items.map((item) => (
                  <article className="cart-item" key={item.productId}>
                    <img src={item.imagePath} alt={item.name} />
                    <div className="cart-item-info">
                      <h3>{item.name}</h3>
                      <p className="muted">{money(item.unitPriceMinor, cart.currency)} each</p>
                      {!item.isActive && (
                        <span className="field-error">
                          Currently unavailable — please remove this item.
                        </span>
                      )}
                      {item.quantity > cart.limits.maxQuantity && (
                        <span className="field-error">
                          Reduce this item to the new limit of {cart.limits.maxQuantity}.
                        </span>
                      )}
                      <div className="quantity-control">
                        <button
                          aria-label={`Decrease ${item.name}`}
                          disabled={busy || item.quantity <= 1}
                          onClick={() =>
                            change(
                              item.productId,
                              Math.min(item.quantity - 1, cart.limits.maxQuantity),
                            )
                          }
                        >
                          <Minus size={13} />
                        </button>
                        <span aria-label={`Quantity for ${item.name}`}>{item.quantity}</span>
                        <button
                          aria-label={`Increase ${item.name}`}
                          disabled={
                            busy || item.quantity >= cart.limits.maxQuantity || !item.isActive
                          }
                          onClick={() => change(item.productId, item.quantity + 1)}
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>
                    <div className="cart-item-end">
                      <strong>{money(item.lineTotalMinor, cart.currency)}</strong>
                      <button
                        className="icon-button"
                        aria-label={`Remove ${item.name}`}
                        onClick={() => remove(item.productId)}
                        disabled={busy}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </article>
                ))}
              </section>
            ) : (
              <EmptyState
                title="A little room for something lovely."
                text="Your bag is empty. Let’s find something that makes your everyday a little brighter."
              />
            )}
            <StudyKitChecker cart={cart} cartBusy={busy} />
          </div>
          {cart.items.length > 0 && (
            <aside className="summary-card">
              <span className="eyebrow">ALL TOGETHER</span>
              <h2>Your order summary</h2>
              <div className="summary-row">
                <span>Subtotal ({cart.quantity} items)</span>
                <span>{money(cart.totalMinor, cart.currency)}</span>
              </div>
              <div className="summary-row muted">
                <span>Extra charges</span>
                <span>None</span>
              </div>
              <div className="summary-total">
                <span>Total</span>
                <strong>{money(cart.totalMinor, cart.currency)}</strong>
              </div>
              <p className="small muted">All prices in {cart.currency}. No additional fees.</p>
              {cart.canCheckout && !busy ? (
                <Link className="button full" to="/checkout">
                  Continue to checkout <ArrowRight size={16} />
                </Link>
              ) : (
                <button className="button full" disabled>
                  Review your bag to continue
                </button>
              )}
              <div className="assurance">
                <ShieldCheck size={17} /> Sign in. Transfer. Upload your slip.
              </div>
              <div className="summary-flower">
                ✳
                <p>
                  Good choices.
                  <br />
                  Little moments of joy.
                </p>
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
