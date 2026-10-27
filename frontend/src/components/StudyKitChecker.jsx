import { useEffect, useState } from 'react';
import { BookOpen, Check, Circle, Plus, RefreshCw } from 'lucide-react';
import { api, money } from '../api';
import { useShop } from '../context/ShopContext';

export default function StudyKitChecker({ cart, cartBusy = false }) {
  const { updateCart, refreshCart, setNotice } = useShop();
  const [availability, setAvailability] = useState({
    state: 'checking',
    available: false,
    purposes: [],
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [purposeId, setPurposeId] = useState('');
  const [result, setResult] = useState(null);
  const [failure, setFailure] = useState(null);
  const [checking, setChecking] = useState(false);
  const [adding, setAdding] = useState(null);
  const selectionKey = `${cart.version}:${purposeId}:${availability.algorithm_id}`;

  useEffect(() => {
    const controller = new AbortController();
    let timer;
    let polling = false;
    async function poll() {
      if (polling || controller.signal.aborted) return;
      polling = true;
      try {
        const response = await api('/plugins/study-kit', { signal: controller.signal });
        if (controller.signal.aborted) return;
        setAvailability(response.data);
        if (response.data.available) {
          setPurposeId((previous) =>
            response.data.purposes.some((item) => item.id === previous)
              ? previous
              : response.data.purposes[0].id,
          );
        } else setResult(null);
      } catch {
        if (controller.signal.aborted) return;
        setAvailability({ state: 'unavailable', available: false, purposes: [] });
        setResult(null);
      } finally {
        polling = false;
        if (!controller.signal.aborted) timer = setTimeout(poll, 10000);
      }
    }
    const onFocus = () => {
      clearTimeout(timer);
      poll();
    };
    poll();
    window.addEventListener('focus', onFocus);
    return () => {
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshKey]);

  const visibleResult =
    result?.cartVersion === cart.version &&
    result?.purposeId === purposeId &&
    result?.algorithmId === availability.algorithm_id
      ? result
      : null;
  const error = failure?.key === selectionKey ? failure.message : null;
  const purpose = availability.purposes.find((item) => item.id === purposeId);
  const busy = checking || Boolean(adding) || cartBusy;
  async function check() {
    setChecking(true);
    setFailure(null);
    setResult(null);
    try {
      const response = await api('/plugins/study-kit/check', {
        method: 'POST',
        body: { purposeId, expectedVersion: cart.version },
      });
      setResult(response.data);
    } catch (error) {
      setFailure({ key: selectionKey, message: error.message });
      if (error.details?.code === 'PLUGIN_UNAVAILABLE') {
        setAvailability({ state: 'unavailable', available: false, purposes: [] });
        setRefreshKey((value) => value + 1);
      }
      if (error.status === 409) await refreshCart().catch(() => {});
    } finally {
      setChecking(false);
    }
  }
  async function add(product) {
    setAdding(product.id);
    setFailure(null);
    try {
      await updateCart('/cart/items', 'POST', {
        productId: product.id,
        quantity: 1,
        expectedVersion: cart.version,
      });
      setResult(null);
      setNotice(`${product.name} was added to your bag. Check your kit again when you’re ready.`);
    } catch (error) {
      setFailure({ key: selectionKey, message: error.message });
    } finally {
      setAdding(null);
    }
  }
  return (
    <section className="kit-checker" aria-labelledby="kit-heading">
      <div className="kit-heading-row">
        <span className="kit-icon" aria-hidden="true">
          <BookOpen size={22} strokeWidth={1.5} />
        </span>
        <div className="kit-title">
          <span className="eyebrow">A LITTLE HELP GETTING READY</span>
          <h2 id="kit-heading">Study Kit Checker</h2>
        </div>
        <span
          className={`kit-availability ${availability.available ? 'available' : ''}`}
          role="status"
          aria-label="Kit checker availability"
        >
          <span aria-hidden="true" />
          {availability.state === 'checking'
            ? 'Checking availability…'
            : availability.available
              ? 'Available'
              : 'Unavailable'}
        </span>
        <button
          className="icon-button kit-refresh"
          aria-label="Refresh kit checker availability"
          onClick={() => setRefreshKey((value) => value + 1)}
          title="Refresh availability"
        >
          <RefreshCw size={16} />
        </button>
      </div>
      <p className="kit-intro">
        Choose what you’re planning. We’ll help you spot the essentials your bag is still missing.
      </p>
      {availability.available && (
        <div className="kit-algorithm" role="status" aria-label="Kit checker algorithm">
          <strong>
            {availability.algorithm_id} · {availability.algorithm_name}
          </strong>
          <span>{availability.algorithm_description}</span>
        </div>
      )}
      {!availability.available ? (
        <p className="kit-offline">
          {availability.state === 'checking'
            ? 'Getting your checker ready…'
            : 'Kit checking is temporarily unavailable. You can keep shopping.'}
        </p>
      ) : null}
      <div className="kit-controls">
        <label className="kit-purpose" htmlFor="kit-purpose">
          <span>What are you getting ready for?</span>
          <select
            id="kit-purpose"
            value={availability.available ? purposeId : ''}
            disabled={!availability.available || busy}
            onChange={(event) => {
              setPurposeId(event.target.value);
              setResult(null);
              setFailure(null);
            }}
          >
            {!availability.available && (
              <option value="">Choose when the checker is available</option>
            )}
            {availability.purposes.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button"
          disabled={!availability.available || !purposeId || busy}
          onClick={check}
        >
          <BookOpen size={16} />
          {checking ? 'Checking your kit…' : 'Check my kit'}
        </button>
      </div>
      {purpose && <p className="kit-purpose-note">{purpose.description}</p>}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {availability.available && visibleResult && (
        <div className="kit-result" aria-live="polite">
          <div className={`kit-result-title ${visibleResult.complete ? 'complete' : ''}`}>
            <strong>
              {visibleResult.complete
                ? 'Your kit is ready!'
                : 'A few little things to complete your kit.'}
            </strong>
            <span>
              {visibleResult.completedCount} of {visibleResult.requiredCount} essentials ready
            </span>
          </div>
          <ul className="kit-requirements">
            {visibleResult.requirements.map((requirement) => (
              <li key={requirement.id}>
                <div
                  className={`kit-requirement-title ${requirement.satisfied ? 'satisfied' : ''}`}
                >
                  {requirement.satisfied ? (
                    <Check size={17} aria-hidden="true" />
                  ) : (
                    <Circle size={15} aria-hidden="true" />
                  )}
                  <strong>{requirement.label}</strong>
                  <span>
                    {requirement.minimumQuantity > 1
                      ? `${requirement.presentQuantity} of ${requirement.minimumQuantity} ready`
                      : requirement.satisfied
                        ? 'In your bag'
                        : 'Missing'}
                  </span>
                </div>
                {requirement.matchedProducts.length > 0 && (
                  <p className="kit-matched">
                    {requirement.matchedProducts.map((item) => item.name).join(', ')}
                  </p>
                )}
                {!requirement.satisfied &&
                  (requirement.suggestions.length ? (
                    <div className="kit-suggestions">
                      {requirement.suggestions.map((item) => (
                        <div className="kit-suggestion" key={item.id}>
                          <img src={item.imagePath} alt="" />
                          <div>
                            <strong>{item.name}</strong>
                            <span>{money(item.priceMinor, item.currency)}</span>
                          </div>
                          <button
                            className="button secondary"
                            disabled={busy}
                            onClick={() => add(item)}
                            aria-label={`Add ${item.name} to bag`}
                          >
                            <Plus size={14} />
                            {adding === item.id ? 'Adding…' : 'Add'}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="kit-matched">
                      No suitable items are currently available. You can still checkout your bag.
                    </p>
                  ))}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="kit-footnote">
        A helpful checklist, just for you. Completing a kit is optional.
      </p>
    </section>
  );
}
