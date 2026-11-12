import { Directive, ElementRef, Input, inject, afterNextRender, OnChanges } from '@angular/core';

/**
 * Reliable value binding for native `<select class="ein">` populated by `@for`.
 *
 * Angular applies `[value]` on a `<select>` before its `@for` options exist on the
 * first render, so the selection silently reverts to the first option (e.g. an
 * assigned role showing "Unassigned" after reload, even though the data is correct).
 * This directive captures the bound value and re-applies it once the options are in
 * the DOM, and again whenever the value changes.
 */
@Directive({ selector: 'select.ein', standalone: true })
export class SelectValue implements OnChanges {
  private el = inject<ElementRef<HTMLSelectElement>>(ElementRef);
  @Input() value: string | number | null = null;

  constructor() { afterNextRender(() => this.sync()); }
  ngOnChanges() { this.sync(); }

  private sync() {
    const v = this.value == null ? '' : String(this.value);
    if (this.el.nativeElement.value !== v) this.el.nativeElement.value = v;
  }
}
