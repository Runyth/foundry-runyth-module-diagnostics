// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
export class RingBuffer {
  #items = [];
  #limit;
  #dropped = 0;

  constructor(limit) {
    this.limit = limit;
  }

  get limit() {
    return this.#limit;
  }

  set limit(value) {
    const parsed = Number.parseInt(value, 10);
    this.#limit = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    this.#trim();
  }

  get size() {
    return this.#items.length;
  }

  get dropped() {
    return this.#dropped;
  }

  push(value) {
    this.#items.push(value);
    if (this.#items.length > this.#limit) {
      const excess = this.#items.length - this.#limit;
      this.#items.splice(0, excess);
      this.#dropped += excess;
    }
  }

  clear() {
    this.#items = [];
    this.#dropped = 0;
  }

  values() {
    return [...this.#items];
  }

  #trim() {
    if (this.#items.length <= this.#limit) return;
    const excess = this.#items.length - this.#limit;
    this.#items.splice(0, excess);
    this.#dropped += excess;
  }
}
