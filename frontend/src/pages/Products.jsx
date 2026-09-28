import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUpRight, Plus, Check, Leaf, Package, Heart } from 'lucide-react';
import { api, money } from '../api';
import { useShop } from '../context/ShopContext';
import { Loading, ErrorMessage } from '../components/UI';
export default function Products() {
  const { cart, refreshCart, updateCart, setNotice } = useShop();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('All the lovely things');
  const [busy, setBusy] = useState('');
  const [added, setAdded] = useState('');
  const [currency, setCurrency] = useState('THB');
  useEffect(() => {
    let active = true;
    api('/products?limit=50')
      .then((result) => {
        if (active) {
          setProducts(result.data);
          setCurrency(result.meta.currency);
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function add(product) {
    setBusy(product.id);
    try {
      const current = cart || (await refreshCart());
      await updateCart('/cart/items', 'POST', {
        productId: product.id,
        quantity: 1,
        expectedVersion: current.version,
      });
      setAdded(product.id);
      setNotice(`${product.name} is in your bag.`);
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy('');
    }
  }
  const categories = [
    'All the lovely things',
    ...new Set(products.map((product) => product.category)),
  ];
  const visibleProducts =
    category === categories[0]
      ? products
      : products.filter((product) => product.category === category);
  return (
    <div className="container">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="tiny-dot" /> SMALL FINDS, EVERYDAY JOY
          </span>
          <h1>
            Make room for
            <br />
            <em>the little things.</em>
          </h1>
          <p>
            Thoughtful essentials for your desk, your bag,
            <br className="desktop-break" /> and all the moments in between.
          </p>
          <a className="button" href="#collection">
            Find your favorites <ArrowDown size={16} />
          </a>
          <div className="hero-note">
            <span>✳</span> A little practical. A little delightful.
          </div>
        </div>
        <div className="hero-art">
          <span className="hero-art-label">
            THE EVERYDAY EDIT <ArrowUpRight size={15} />
          </span>
          <img
            src="/desk-scene.svg"
            alt="Thoughtfully arranged notebooks, a ceramic mug, and pencils"
          />
          <span className="hero-art-caption">Good things, in good company.</span>
          <span className="floating-tag">a little everyday lovely ♡</span>
        </div>
      </section>
      <section className="values-strip" aria-label="Our collection">
        <span>
          <Leaf size={17} /> Thoughtfully selected
        </span>
        <span>
          <Package size={17} /> Made for your everyday
        </span>
        <span>
          <Heart size={17} /> Little things to love
        </span>
      </section>
      <section id="collection" className="collection">
        <div className="section-heading">
          <div>
            <span className="eyebrow">THE COLLECTION</span>
            <h2>
              Your everyday, <em>with a little extra.</em>
            </h2>
          </div>
          <span className="count-label">{visibleProducts.length} lovely things</span>
        </div>
        <div className="category-tabs" aria-label="Product categories">
          {categories.map((value) => (
            <button
              key={value}
              className={category === value ? 'active' : ''}
              onClick={() => setCategory(value)}
              aria-pressed={category === value}
            >
              {value}
            </button>
          ))}
        </div>
        {loading ? (
          <Loading text="Finding lovely things…" />
        ) : error ? (
          <ErrorMessage error={error} />
        ) : (
          <div className="product-grid">
            {visibleProducts.map((product, index) => (
              <article className="product-card" key={product.id}>
                <div className="product-image">
                  <img
                    src={product.imagePath}
                    alt={product.name}
                    loading={index > 3 ? 'lazy' : 'eager'}
                  />
                  {product.sku === 'NOTE-01' && (
                    <span className="product-tag">A daily favorite</span>
                  )}
                  <span className="product-color">{product.color}</span>
                </div>
                <div className="product-details">
                  <span className="product-category">{product.category}</span>
                  <div className="product-title-row">
                    <h3>{product.name}</h3>
                    <span>{money(product.priceMinor, currency)}</span>
                  </div>
                  <p>{product.description}</p>
                  <button
                    className="add-button"
                    onClick={() => add(product)}
                    disabled={Boolean(busy)}
                    aria-label={`Add ${product.name} to bag`}
                  >
                    {busy === product.id
                      ? 'Adding…'
                      : added === product.id
                        ? 'Add another'
                        : 'Add to bag'}
                    {added === product.id ? <Check size={17} /> : <Plus size={17} />}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        {!loading && !error && !products.length && (
          <p className="empty-state">Our collection is getting ready. Please check back soon.</p>
        )}
      </section>
      <aside className="closing-note">
        <span>✳</span>
        <p>
          Ordinary days deserve <em>lovely little things.</em>
        </p>
        <span>✳</span>
      </aside>
    </div>
  );
}
