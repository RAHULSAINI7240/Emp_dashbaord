import { ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges, computed, signal } from '@angular/core';

@Component({
  selector: 'app-animated-number',
  template: `{{ prefix }}{{ formattedValue() }}{{ suffix }}`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AnimatedNumberComponent implements OnChanges {
  @Input({ required: true }) value = 0;
  @Input() decimals = 0;
  @Input() prefix = '';
  @Input() suffix = '';
  @Input() durationMs = 700;

  readonly displayValue = signal(0);
  readonly formattedValue = computed(() => this.displayValue().toFixed(this.decimals));

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['value']) return;
    this.animateTo(this.value);
  }

  private animateTo(target: number): void {
    const startValue = this.displayValue();
    const startAt = performance.now();
    const duration = Math.max(120, this.durationMs);

    const frame = (time: number) => {
      const progress = Math.min((time - startAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      this.displayValue.set(startValue + (target - startValue) * eased);
      if (progress < 1) {
        requestAnimationFrame(frame);
      }
    };

    requestAnimationFrame(frame);
  }
}
