import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexFill,
  ApexGrid,
  ApexMarkers,
  ApexStroke,
  ApexTooltip,
  ApexXAxis,
  NgApexchartsModule
} from 'ng-apexcharts';
import { AnimatedNumberComponent } from './animated-number.component';
import { FocusSnapshot } from './analytics.models';

interface FocusTrendChartOptions {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  stroke: ApexStroke;
  dataLabels: ApexDataLabels;
  markers: ApexMarkers;
  tooltip: ApexTooltip;
  fill: ApexFill;
  grid: ApexGrid;
}

@Component({
  selector: 'app-focus-analytics-card',
  imports: [MatIconModule, NgApexchartsModule, AnimatedNumberComponent],
  templateUrl: './focus-analytics-card.component.html',
  styleUrl: './focus-analytics-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FocusAnalyticsCardComponent implements OnChanges {
  @Input({ required: true }) snapshot!: FocusSnapshot;

  chartOptions: FocusTrendChartOptions = {
    series: [{ name: 'Focus score', data: [0, 0, 0, 0, 0, 0, 0] }],
    chart: {
      type: 'area',
      height: 220,
      toolbar: { show: false },
      animations: {
        enabled: true,
        speed: 620
      }
    },
    xaxis: {
      categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      labels: {
        style: {
          colors: '#7784a4',
          fontSize: '12px'
        }
      }
    },
    stroke: {
      curve: 'smooth',
      width: 3,
      colors: ['#5e63ff']
    },
    dataLabels: { enabled: false },
    markers: {
      size: 4,
      colors: ['#5e63ff'],
      strokeWidth: 0
    },
    tooltip: {
      y: {
        formatter: (value: number) => `${Math.round(value)} / 100`
      }
    },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.3,
        opacityTo: 0.04,
        stops: [0, 90, 100],
        colorStops: []
      }
    },
    grid: {
      borderColor: '#dde4ff',
      strokeDashArray: 5
    }
  };

  ngOnChanges(): void {
    if (!this.snapshot) return;
    this.chartOptions = {
      ...this.chartOptions,
      series: [{ name: 'Focus score', data: this.snapshot.weeklyFocusScores }]
    };
  }

  get trendPositive(): boolean {
    return this.snapshot.trendDelta >= 0;
  }
}
