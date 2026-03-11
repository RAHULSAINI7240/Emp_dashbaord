import { ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { HeatmapCell, ProductivityAttendanceLog } from './analytics.models';

interface MonthOption {
  key: string;
  label: string;
}

@Component({
  selector: 'app-work-heatmap',
  imports: [NgFor, NgIf, NgClass, MatIconModule],
  templateUrl: './work-heatmap.component.html',
  styleUrl: './work-heatmap.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkHeatmapComponent implements OnChanges {
  @Input({ required: true }) logs: ProductivityAttendanceLog[] = [];

  months: MonthOption[] = [];
  selectedMonth = '';
  weeks: HeatmapCell[][] = [];

  readonly days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['logs']) return;
    this.buildMonths();
    if (!this.selectedMonth && this.months.length) {
      this.selectedMonth = this.months[0]?.key ?? '';
    }
    this.rebuildGrid();
  }

  onMonthChange(month: string): void {
    this.selectedMonth = month;
    this.rebuildGrid();
  }

  intensityClass(cell: HeatmapCell): string {
    return `level-${cell.intensity}`;
  }

  cellTooltip(cell: HeatmapCell): string {
    const dateLabel = new Date(cell.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${dateLabel}: ${cell.hours.toFixed(1)}h worked`;
  }

  private buildMonths(): void {
    const keys = new Set<string>();
    keys.add(this.monthKey(new Date()));
    this.logs.forEach((log) => keys.add(log.date.slice(0, 7)));

    this.months = Array.from(keys)
      .sort((a, b) => b.localeCompare(a))
      .map((key) => {
        const [year, month] = key.split('-');
        const label = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en-US', {
          month: 'long',
          year: 'numeric'
        });
        return { key, label };
      });
  }

  private rebuildGrid(): void {
    if (!this.selectedMonth) {
      this.weeks = [];
      return;
    }

    const [yearRaw, monthRaw] = this.selectedMonth.split('-');
    const year = Number(yearRaw);
    const month = Number(monthRaw) - 1;

    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);

    const start = new Date(monthStart);
    const startDay = (monthStart.getDay() + 6) % 7;
    start.setDate(monthStart.getDate() - startDay);

    const end = new Date(monthEnd);
    const endDay = (monthEnd.getDay() + 6) % 7;
    end.setDate(monthEnd.getDate() + (6 - endDay));

    const dailyHours = this.hoursMap();
    const cells: HeatmapCell[] = [];

    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      const date = this.dateKey(cursor);
      const hours = dailyHours.get(date) ?? 0;
      cells.push({
        date,
        day: cursor.getDay(),
        hours,
        intensity: this.intensity(hours),
        isCurrentMonth: cursor.getMonth() === month
      });
    }

    const nextWeeks: HeatmapCell[][] = [];
    for (let index = 0; index < cells.length; index += 7) {
      nextWeeks.push(cells.slice(index, index + 7));
    }
    this.weeks = nextWeeks;
  }

  private hoursMap(): Map<string, number> {
    const map = new Map<string, number>();
    this.logs.forEach((log) => {
      const current = map.get(log.date) ?? 0;
      map.set(log.date, Number((current + log.workMinutes / 60).toFixed(1)));
    });
    return map;
  }

  private intensity(hours: number): 0 | 1 | 2 | 3 | 4 {
    if (hours <= 0) return 0;
    if (hours <= 3) return 1;
    if (hours <= 5) return 2;
    if (hours <= 7) return 3;
    return 4;
  }

  private monthKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private dateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
}
