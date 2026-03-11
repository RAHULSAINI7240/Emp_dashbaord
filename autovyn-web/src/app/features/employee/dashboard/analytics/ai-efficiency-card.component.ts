import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import {
  ApexChart,
  ApexDataLabels,
  ApexLegend,
  ApexNonAxisChartSeries,
  ApexPlotOptions,
  ApexResponsive,
  ApexStroke,
  NgApexchartsModule
} from 'ng-apexcharts';
import { AiEfficiencySnapshot } from './analytics.models';
import { AnimatedNumberComponent } from './animated-number.component';

interface DonutChartOptions {
  series: ApexNonAxisChartSeries;
  chart: ApexChart;
  labels: string[];
  responsive: ApexResponsive[];
  legend: ApexLegend;
  dataLabels: ApexDataLabels;
  plotOptions: ApexPlotOptions;
  stroke: ApexStroke;
}

@Component({
  selector: 'app-ai-efficiency-card',
  imports: [MatIconModule, NgApexchartsModule, AnimatedNumberComponent],
  templateUrl: './ai-efficiency-card.component.html',
  styleUrl: './ai-efficiency-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AiEfficiencyCardComponent implements OnChanges {
  @Input({ required: true }) snapshot!: AiEfficiencySnapshot;

  donutChartOptions: DonutChartOptions = {
    series: [0, 0],
    chart: {
      type: 'donut',
      height: 230,
      animations: {
        enabled: true,
        speed: 680
      }
    },
    labels: ['Accepted', 'Rejected'],
    legend: {
      position: 'bottom',
      fontSize: '13px',
      labels: {
        colors: '#55607a'
      }
    },
    responsive: [
      {
        breakpoint: 640,
        options: {
          chart: { height: 190 },
          legend: { position: 'bottom' }
        }
      }
    ],
    dataLabels: {
      enabled: true,
      formatter: (val: number) => `${Math.round(val)}%`
    },
    plotOptions: {
      pie: {
        donut: {
          size: '67%'
        }
      }
    },
    stroke: {
      width: 2,
      colors: ['#ffffff']
    }
  };

  ngOnChanges(): void {
    if (!this.snapshot) return;
    this.donutChartOptions = {
      ...this.donutChartOptions,
      series: [this.snapshot.acceptedPercent, this.snapshot.rejectedPercent]
    };
  }

  get trendPositive(): boolean {
    return this.snapshot.efficiencyDelta >= 0;
  }
}
