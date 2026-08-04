import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function Dropdown({ value, onChange, options, groups, label }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const flatten = () => {
    if (groups) {
      return groups.flatMap(g => g.options.map(o => ({ value: o.value, label: o.label, icon: o.icon, group: g.label })));
    }
    return options.map(o => ({ ...o, group: null }));
  };
  const items = flatten();
  const current = items.find(i => i.value === value);

  const pick = (item) => {
    onChange(item.value);
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (e) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setOpen(true);
        setActiveIndex(Math.max(0, items.findIndex(i => i.value === value)));
      }
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(a => (a + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(a => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (activeIndex >= 0) pick(items[activeIndex]);
      else setOpen(false);
    } else if (e.key === 'Tab') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div className="custom-select" role="listbox" aria-label={label}>
      <button
        type="button"
        className="custom-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onKeyDown={onKeyDown}
      >
        <span className="custom-select-value">{current.icon && <span className="custom-select-option-icon">{current.icon}</span>}{current ? current.label : label}</span>
        <ChevronDown size={14} className={`custom-select-chevron ${open ? 'open' : ''}`} />
      </button>
      {open && (
        <>
          <div className="dropdown-backdrop" onClick={() => setOpen(false)} />
          <div className="custom-select-panel" role="listbox" aria-label={label}>
            {items.map((item, idx) => (
              <span key={item.value}>
                {item.group && (idx === 0 || items[idx - 1].group !== item.group) && (
                  <div className="custom-select-group-label">{item.group}</div>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={item.value === value}
                  className={`custom-select-item ${item.value === value ? 'selected' : ''} ${activeIndex === idx ? 'highlighted' : ''}`}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => pick(item)}
                >
                  {item.icon && <span className="custom-select-option-icon">{item.icon}</span>}
                  {item.label}
                </button>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
