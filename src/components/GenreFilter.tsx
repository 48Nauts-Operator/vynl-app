"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import { Star, Check, ChevronDown, Search, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFavoriteGenres } from "@/hooks/useFavoriteGenres";

type Tab = "favorites" | "all";

interface GenreFilterProps {
  genres: string[];
  value: string | null;
  onChange: (genre: string | null) => void;
  className?: string;
  /** Trigger button width. Default w-[160px] to match existing layouts. */
  triggerClassName?: string;
}

export function GenreFilter({
  genres,
  value,
  onChange,
  triggerClassName = "w-[160px]",
}: GenreFilterProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);

  const { favorites, isFavorite, toggleFavorite } = useFavoriteGenres();

  // Open Favorites by default if there are any.
  useEffect(() => {
    if (open) {
      setTab(favorites.length > 0 ? "favorites" : "all");
      setSearch("");
      // Focus search after popover animates in.
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open, favorites.length]);

  const sortedGenres = useMemo(
    () => [...genres].sort((a, b) => a.localeCompare(b)),
    [genres]
  );

  const filteredFavorites = useMemo(() => {
    const q = search.trim().toLowerCase();
    return favorites
      .filter((g) => genres.includes(g))
      .filter((g) => (q ? g.toLowerCase().includes(q) : true))
      .sort((a, b) => a.localeCompare(b));
  }, [favorites, genres, search]);

  const filteredAll = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortedGenres.filter((g) =>
      q ? g.toLowerCase().includes(q) : true
    );
  }, [sortedGenres, search]);

  // On "All" tab, pin favorites at the top, then the rest.
  const allListPartitioned = useMemo(() => {
    const favSet = new Set(filteredFavorites);
    const rest = filteredAll.filter((g) => !favSet.has(g));
    return { favs: filteredFavorites, rest };
  }, [filteredFavorites, filteredAll]);

  const handleSelect = (g: string | null) => {
    onChange(g);
    setOpen(false);
  };

  const triggerLabel = value ?? "All genres";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={`justify-between ${triggerClassName}`}
        >
          <span className="truncate flex items-center gap-1.5">
            {value && isFavorite(value) && (
              <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />
            )}
            {triggerLabel}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="p-0 w-64" align="start">
        {/* Tabs */}
        <div className="flex border-b border-border">
          {(["favorites", "all"] as Tab[]).map((t) => {
            const active = tab === t;
            const count =
              t === "favorites" ? filteredFavorites.length : filteredAll.length;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 text-xs uppercase tracking-wider py-2 transition-colors ${
                  active
                    ? "text-foreground border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "favorites" ? (
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3 w-3" />
                    Favorites
                    {count > 0 && (
                      <span className="text-[10px] opacity-70">({count})</span>
                    )}
                  </span>
                ) : (
                  <span>
                    All
                    {count > 0 && (
                      <span className="text-[10px] opacity-70 ml-1">
                        ({count})
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative border-b border-border">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search genres..."
            className="h-8 pl-8 pr-7 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none text-sm"
          />
          {search && (
            <button
              onClick={() => {
                setSearch("");
                searchRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-72 overflow-y-auto py-1">
          {/* "All genres" reset option always present, top of list */}
          {tab === "all" && !search && (
            <Row
              label="All genres"
              selected={value === null}
              showStar={false}
              isFavorite={false}
              onSelect={() => handleSelect(null)}
              onToggleFavorite={() => {}}
            />
          )}

          {tab === "favorites" ? (
            filteredFavorites.length === 0 ? (
              <EmptyHint search={search} variant="favorites" />
            ) : (
              filteredFavorites.map((g) => (
                <Row
                  key={g}
                  label={g}
                  selected={value === g}
                  showStar
                  isFavorite
                  onSelect={() => handleSelect(g)}
                  onToggleFavorite={() => toggleFavorite(g)}
                />
              ))
            )
          ) : filteredAll.length === 0 ? (
            <EmptyHint search={search} variant="all" />
          ) : (
            <>
              {/* On All tab, when not searching, show favorites pinned first */}
              {!search &&
                allListPartitioned.favs.map((g) => (
                  <Row
                    key={`fav-${g}`}
                    label={g}
                    selected={value === g}
                    showStar
                    isFavorite
                    onSelect={() => handleSelect(g)}
                    onToggleFavorite={() => toggleFavorite(g)}
                  />
                ))}
              {!search && allListPartitioned.favs.length > 0 && (
                <div className="my-1 border-t border-border" />
              )}
              {(search ? filteredAll : allListPartitioned.rest).map((g) => (
                <Row
                  key={g}
                  label={g}
                  selected={value === g}
                  showStar
                  isFavorite={isFavorite(g)}
                  onSelect={() => handleSelect(g)}
                  onToggleFavorite={() => toggleFavorite(g)}
                />
              ))}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface RowProps {
  label: string;
  selected: boolean;
  showStar: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}

function Row({
  label,
  selected,
  showStar,
  isFavorite,
  onSelect,
  onToggleFavorite,
}: RowProps) {
  return (
    <div
      className={`flex items-center gap-1 px-2 py-1.5 text-sm cursor-pointer hover:bg-accent ${
        selected ? "bg-accent/60" : ""
      }`}
      onClick={onSelect}
    >
      {showStar ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className="shrink-0 p-0.5 rounded hover:bg-background"
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star
            className={`h-3.5 w-3.5 ${
              isFavorite
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground"
            }`}
          />
        </button>
      ) : (
        <span className="w-[18px]" />
      )}
      <span className="flex-1 truncate">{label}</span>
      {selected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
    </div>
  );
}

function EmptyHint({
  search,
  variant,
}: {
  search: string;
  variant: "favorites" | "all";
}) {
  if (search) {
    return (
      <p className="text-xs text-muted-foreground text-center py-6 px-3">
        No genres match &ldquo;{search}&rdquo;.
      </p>
    );
  }
  if (variant === "favorites") {
    return (
      <p className="text-xs text-muted-foreground text-center py-6 px-3">
        No favorites yet. Tap the star next to a genre on the{" "}
        <span className="font-medium">All</span> tab to add it.
      </p>
    );
  }
  return (
    <p className="text-xs text-muted-foreground text-center py-6 px-3">
      No genres available.
    </p>
  );
}
