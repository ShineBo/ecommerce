import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Clock, ReceiptText, ShieldCheck } from 'lucide-react';
import { api, money, dateLabel } from '../api';
import { EmptyState, ErrorMessage, Loading, Status } from '../components/UI';
export function Orders() {
  const [orders, setOrders] = useState(null);
  const [meta, setMeta] = useState({ total: 0, limit: 10 });
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setOrders(null);
    setError('');
    api(`/orders?page=${page}`)
      .then((result) => {
        if (active) {
          setOrders(result.data);
          setMeta(result.meta);
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [page]);
  return (
    <div className="container page-container">
      <div className="page-heading">
        <span className="eyebrow">A FEW THINGS TO LOOK FORWARD TO</span>
        <h1>
          Your <em>lovely finds.</em>
        </h1>
        <p className="muted">All your orders, together in one little place.</p>
      </div>
      <ErrorMessage error={error} />
      {!orders ? (
        !error && <Loading />
      ) : !orders.length ? (
        <EmptyState
          title="Your story starts with a little find."
          text="Once you place an order, you’ll find it right here."
        />
      ) : (
        <>
          <div className="orders-list">
            {orders.map((order) => (
              <Link className="order-row" to={`/orders/${order.id}`} key={order.id}>
                <div className="order-icon">
                  <ReceiptText size={23} strokeWidth={1.5} />
                </div>
                <div className="order-reference">
                  <h3>{order.orderNumber}</h3>
                  <span>
                    {dateLabel(order.createdAt)} ·{' '}
                    {order.items.reduce((sum, item) => sum + item.quantity, 0)} items
                  </span>
                </div>
                <Status value={order.status} />
                <strong>{money(order.totalMinor, order.currency)}</strong>
                <ArrowRight size={18} />
              </Link>
            ))}
          </div>
          {meta.total > meta.limit && (
            <div className="pagination">
              <button
                className="button secondary"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>
                Page {page} of {Math.ceil(meta.total / meta.limit)}
              </span>
              <button
                className="button secondary"
                disabled={page * meta.limit >= meta.total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
export function OrderDetail() {
  const { id } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [showSlip, setShowSlip] = useState(false);
  useEffect(() => {
    let active = true;
    setOrder(null);
    setError('');
    api(`/orders/${id}`)
      .then((result) => {
        if (active) setOrder(result.data);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  return (
    <div className="container page-container">
      <Link className="back-link" to="/orders">
        <ArrowLeft size={15} /> All your orders
      </Link>
      <ErrorMessage error={error} />
      {!order ? (
        !error && <Loading />
      ) : (
        <>
          <div className="order-intro">
            <div className="success-icon">
              {order.status === 'PENDING_REVIEW' ? (
                <Clock size={29} strokeWidth={1.5} />
              ) : (
                <Check size={29} />
              )}
            </div>
            <span className="eyebrow">
              {location.state?.submitted
                ? 'THANK YOU FOR SHOPPING SMALL'
                : 'YOUR ORDER, AT A GLANCE'}
            </span>
            <h1>
              {location.state?.submitted ? (
                <>
                  Your lovely things
                  <br />
                  are <em>one step closer.</em>
                </>
              ) : (
                <>
                  A little order of <em>joy.</em>
                </>
              )}
            </h1>
            <p className="muted">
              {order.status === 'PENDING_REVIEW'
                ? 'Your order is saved. Your payment slip is awaiting a manual review.'
                : order.status === 'CONFIRMED'
                  ? 'Your payment has been reviewed and confirmed.'
                  : 'Your payment slip was reviewed. Please see the reason below.'}
            </p>
            <Status value={order.status} />
          </div>
          <div className="two-column">
            <section className="cart-panel">
              <div className="panel-title">
                <div>
                  <h2>{order.orderNumber}</h2>
                  <span className="small muted">Placed {dateLabel(order.createdAt)}</span>
                </div>
                <ReceiptText size={22} />
              </div>
              {order.items.map((item) => (
                <div className="cart-item" key={item.productId}>
                  <img src={item.imagePath} alt={item.name} />
                  <div className="cart-item-info">
                    <h3>{item.name}</h3>
                    <p className="muted">
                      Qty {item.quantity} · {money(item.unitPriceMinor, order.currency)} each
                    </p>
                  </div>
                  <strong>{money(item.lineTotalMinor, order.currency)}</strong>
                </div>
              ))}
              <div className="order-total">
                <span>Order total</span>
                <strong>{money(order.totalMinor, order.currency)}</strong>
              </div>
            </section>
            <aside className="summary-card">
              <span className="eyebrow">PAYMENT DETAILS</span>
              <h2>Safe in your account.</h2>
              <div className="summary-row">
                <span>Method</span>
                <strong>Bank transfer</strong>
              </div>
              <div className="review-note">
                <ShieldCheck size={20} />
                <p>Only you and the shop operator can view your payment slip.</p>
              </div>
              {order.review && (
                <div className="review-result">
                  <strong>
                    {order.status === 'REJECTED' ? 'Review note' : 'Payment approved'}
                  </strong>
                  <p>{order.review.reason || 'Your payment has been confirmed.'}</p>
                  <small>{dateLabel(order.review.reviewedAt)}</small>
                </div>
              )}
              <button className="button secondary full" onClick={() => setShowSlip(!showSlip)}>
                {showSlip ? 'Hide payment slip' : 'View payment slip'}
                <ReceiptText size={16} />
              </button>
              {showSlip && (
                <img className="order-slip" src={order.slipUrl} alt="Your submitted payment slip" />
              )}
              <Link className="button full" to="/products">
                Find something lovely <ArrowRight size={16} />
              </Link>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
