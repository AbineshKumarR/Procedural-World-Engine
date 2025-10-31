// src/components/PresetsPanel.jsx
import React, { useEffect, useState } from 'react';

const KEY = 'pwe_presets_v1';

export default function PresetsPanel({ onLoadPreset }) {
  const [presets, setPresets] = useState([]);
  const [name, setName] = useState('');
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    const raw = localStorage.getItem(KEY);
    try {
      const parsed = raw ? JSON.parse(raw) : [];
      setPresets(parsed);
    } catch (err) {
      setPresets([]);
    }
  }, []);

  function savePreset(obj) {
    const p = { name: name || `preset-${Date.now()}`, config: obj, id: Date.now() };
    const next = [...presets, p];
    localStorage.setItem(KEY, JSON.stringify(next));
    setPresets(next);
    setName('');
  }

  function loadPreset(p) {
    setCurrent(p.id);
    if (onLoadPreset) onLoadPreset(p.config);
  }

  function removePreset(id) {
    const next = presets.filter((x) => x.id !== id);
    localStorage.setItem(KEY, JSON.stringify(next));
    setPresets(next);
    if (current === id) setCurrent(null);
  }

  return (
    <div className="bg-slate-800 p-3 rounded">
      <div className="text-sm font-medium mb-2">Presets</div>
      <div className="flex gap-2 mb-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="preset name"
          className="flex-1 p-2 rounded bg-slate-700 text-sm"
        />
        <button
          onClick={() => savePreset({ seed: '1234', indexType: 'grid', entityCount: 1000 })}
          className="px-3 py-2 bg-indigo-600 rounded"
        >
          Save
        </button>
      </div>

      <div className="space-y-2 max-h-44 overflow-auto">
        {presets.length === 0 && <div className="text-xs text-slate-400">No presets yet</div>}
        {presets.map((p) => (
          <div key={p.id} className="flex items-center justify-between bg-slate-700 p-2 rounded">
            <div className="text-sm">{p.name}</div>
            <div className="flex gap-2">
              <button
                onClick={() => loadPreset(p)}
                className="px-2 py-1 bg-emerald-500 rounded text-xs"
              >
                Load
              </button>
              <button
                onClick={() => removePreset(p.id)}
                className="px-2 py-1 bg-red-600 rounded text-xs"
              >
                Del
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
