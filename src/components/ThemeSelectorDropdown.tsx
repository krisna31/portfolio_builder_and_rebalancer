import React, { useEffect, useRef, useState } from 'react';
import { Palette, Check, Sparkles } from 'lucide-react';
import { ThemeId, ALL_THEME_IDS, THEME_REGISTRY, getThemeDefinition } from '../types/theme';

interface ThemeSelectorDropdownProps {
  currentThemeId: ThemeId;
  onSelectTheme: (id: ThemeId) => void;
  colorScheme: 'light' | 'dark';
}

export const ThemeSelectorDropdown: React.FC<ThemeSelectorDropdownProps> = ({
  currentThemeId,
  onSelectTheme,
  colorScheme,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const activeTheme = getThemeDefinition(currentThemeId);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (id: ThemeId) => {
    onSelectTheme(id);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        ref={triggerRef}
        type="button"
        id="theme-selector-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Tema Tampilan: ${activeTheme.name}`}
        title={`Tema Tampilan: ${activeTheme.name} (${activeTheme.archetype})`}
        className="flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium text-[var(--text-primary)] transition hover:bg-black/5 dark:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]"
      >
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0 border border-black/20 dark:border-white/30"
          style={{
            backgroundColor: colorScheme === 'dark' ? activeTheme.darkAccent : activeTheme.lightAccent,
          }}
        />
        <Palette className="h-3.5 w-3.5 shrink-0 opacity-80" />
        <span className="hidden md:inline font-mono text-[11px] truncate max-w-[110px]">
          {activeTheme.name}
        </span>
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="theme-selector-trigger"
          className="absolute right-0 top-full mt-1.5 w-72 origin-top-right rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-1.5 shadow-elevated z-50 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--border-subtle)] mb-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-[var(--accent-primary)]" />
              Pilih Tema (8 Preset)
            </span>
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
              WCAG AAA/AA
            </span>
          </div>

          <div className="space-y-0.5 max-h-[360px] overflow-y-auto">
            {ALL_THEME_IDS.map((id) => {
              const theme = THEME_REGISTRY[id];
              const isSelected = id === currentThemeId;
              const accentColor = colorScheme === 'dark' ? theme.darkAccent : theme.lightAccent;
              const bgColor = colorScheme === 'dark' ? theme.darkBg : theme.lightBg;

              return (
                <button
                  key={id}
                  role="menuitem"
                  type="button"
                  onClick={() => handleSelect(id)}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-[var(--radius-sm)] text-left text-xs transition ${
                    isSelected
                      ? 'bg-[var(--accent-tint)] font-semibold text-[var(--text-primary)]'
                      : 'hover:bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Dual-color Swatch */}
                    <div
                      className="h-5 w-5 rounded shrink-0 flex items-center justify-center border border-black/15 dark:border-white/20 shadow-xs"
                      style={{ backgroundColor: bgColor }}
                      title={`Background: ${bgColor}, Accent: ${accentColor}`}
                    >
                      <div
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: accentColor }}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{theme.name}</span>
                        <span className="font-mono text-[9px] uppercase tracking-wider px-1 py-0.2 rounded border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-muted)] shrink-0">
                          {theme.badge}
                        </span>
                      </div>
                      <p className="truncate text-[10px] text-[var(--text-muted)]">
                        {theme.archetype}
                      </p>
                    </div>
                  </div>

                  {isSelected && (
                    <Check className="h-4 w-4 shrink-0 text-[var(--accent-primary)] ml-2" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
