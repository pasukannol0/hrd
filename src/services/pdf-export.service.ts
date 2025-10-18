import PDFDocument from 'pdfkit';
import { Writable } from 'stream';
import { formatInTimeZone } from 'date-fns-tz';
import {
  DailyAttendanceSummary,
  WeeklyAttendanceSummary,
  MonthlyAttendanceSummary,
  OfficeOccupancySummary,
  ReportType,
} from '../types';

export interface PdfExportConfig {
  timezone?: string;
  companyName?: string;
}

export class PdfExportService {
  private timezone: string;
  private companyName: string;

  constructor(config?: PdfExportConfig) {
    this.timezone = config?.timezone || 'Asia/Jakarta';
    this.companyName = config?.companyName || 'Attendance System';
  }

  private formatDate(date: Date): string {
    return formatInTimeZone(date, this.timezone, 'yyyy-MM-dd');
  }

  private formatDateTime(date: Date): string {
    return formatInTimeZone(date, this.timezone, 'yyyy-MM-dd HH:mm:ss');
  }

  private formatTime(date: Date): string {
    return formatInTimeZone(date, this.timezone, 'HH:mm:ss');
  }

  private addHeader(doc: PDFKit.PDFDocument, title: string): void {
    doc
      .fontSize(20)
      .text(this.companyName, 50, 50)
      .fontSize(16)
      .text(title, 50, 80)
      .fontSize(10)
      .text(`Generated: ${this.formatDateTime(new Date())}`, 50, 110)
      .moveDown(2);
  }

  private addFooter(doc: PDFKit.PDFDocument, pageNumber: number): void {
    doc
      .fontSize(8)
      .text(
        `Page ${pageNumber} - Timezone: ${this.timezone}`,
        50,
        doc.page.height - 50,
        { align: 'center' }
      );
  }

  async exportDailyReport(data: DailyAttendanceSummary[], output: Writable): Promise<void> {
    const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });
    doc.pipe(output);

    this.addHeader(doc, 'Daily Attendance Summary');

    const tableTop = 150;
    const rowHeight = 25;
    const fontSize = 8;
    let y = tableTop;
    let pageNumber = 1;

    const columns = [
      { header: 'Date', width: 70 },
      { header: 'Office', width: 80 },
      { header: 'Employee', width: 100 },
      { header: 'Dept', width: 60 },
      { header: 'Check-ins', width: 50 },
      { header: 'First In', width: 60 },
      { header: 'Last Out', width: 60 },
      { header: 'Work (hrs)', width: 60 },
      { header: 'Late', width: 40 },
      { header: 'Early', width: 40 },
      { header: 'Miss CO', width: 50 },
    ];

    doc.fontSize(fontSize).font('Helvetica-Bold');
    let x = 50;
    columns.forEach((col) => {
      doc.text(col.header, x, y, { width: col.width, align: 'left' });
      x += col.width;
    });

    doc.font('Helvetica');
    y += rowHeight;

    for (const row of data) {
      if (y > doc.page.height - 100) {
        this.addFooter(doc, pageNumber);
        doc.addPage({ margin: 50, size: 'A4', layout: 'landscape' });
        pageNumber++;
        y = 50;

        doc.fontSize(fontSize).font('Helvetica-Bold');
        x = 50;
        columns.forEach((col) => {
          doc.text(col.header, x, y, { width: col.width, align: 'left' });
          x += col.width;
        });
        doc.font('Helvetica');
        y += rowHeight;
      }

      x = 50;
      doc
        .fontSize(fontSize)
        .text(this.formatDate(row.attendance_date), x, y, { width: columns[0].width });
      x += columns[0].width;
      doc.text(row.office_name, x, y, { width: columns[1].width });
      x += columns[1].width;
      doc.text(row.full_name, x, y, { width: columns[2].width });
      x += columns[2].width;
      doc.text(row.department || 'N/A', x, y, { width: columns[3].width });
      x += columns[3].width;
      doc.text(row.check_in_count.toString(), x, y, { width: columns[4].width });
      x += columns[4].width;
      doc.text(this.formatTime(row.first_check_in), x, y, { width: columns[5].width });
      x += columns[5].width;
      doc.text(this.formatTime(row.last_check_out), x, y, { width: columns[6].width });
      x += columns[6].width;
      doc.text((row.total_work_minutes / 60).toFixed(2), x, y, { width: columns[7].width });
      x += columns[7].width;
      doc.text(row.late_count.toString(), x, y, { width: columns[8].width });
      x += columns[8].width;
      doc.text(row.early_departure_count.toString(), x, y, { width: columns[9].width });
      x += columns[9].width;
      doc.text(row.missing_checkout_count.toString(), x, y, { width: columns[10].width });

      y += rowHeight;
    }

    this.addFooter(doc, pageNumber);
    doc.end();

    return new Promise((resolve, reject) => {
      doc.on('finish', resolve);
      doc.on('error', reject);
    });
  }

  async exportWeeklyReport(data: WeeklyAttendanceSummary[], output: Writable): Promise<void> {
    const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });
    doc.pipe(output);

    this.addHeader(doc, 'Weekly Attendance Summary');

    const tableTop = 150;
    const rowHeight = 25;
    const fontSize = 8;
    let y = tableTop;
    let pageNumber = 1;

    const columns = [
      { header: 'Week Start', width: 70 },
      { header: 'Office', width: 80 },
      { header: 'Employee', width: 100 },
      { header: 'Dept', width: 60 },
      { header: 'Days', width: 40 },
      { header: 'Check-ins', width: 50 },
      { header: 'Work (hrs)', width: 60 },
      { header: 'Avg (hrs)', width: 60 },
      { header: 'Late', width: 40 },
      { header: 'Early', width: 40 },
      { header: 'Miss CO', width: 50 },
    ];

    doc.fontSize(fontSize).font('Helvetica-Bold');
    let x = 50;
    columns.forEach((col) => {
      doc.text(col.header, x, y, { width: col.width, align: 'left' });
      x += col.width;
    });

    doc.font('Helvetica');
    y += rowHeight;

    for (const row of data) {
      if (y > doc.page.height - 100) {
        this.addFooter(doc, pageNumber);
        doc.addPage({ margin: 50, size: 'A4', layout: 'landscape' });
        pageNumber++;
        y = 50;

        doc.fontSize(fontSize).font('Helvetica-Bold');
        x = 50;
        columns.forEach((col) => {
          doc.text(col.header, x, y, { width: col.width, align: 'left' });
          x += col.width;
        });
        doc.font('Helvetica');
        y += rowHeight;
      }

      x = 50;
      doc
        .fontSize(fontSize)
        .text(this.formatDate(row.week_start_date), x, y, { width: columns[0].width });
      x += columns[0].width;
      doc.text(row.office_name, x, y, { width: columns[1].width });
      x += columns[1].width;
      doc.text(row.full_name, x, y, { width: columns[2].width });
      x += columns[2].width;
      doc.text(row.department || 'N/A', x, y, { width: columns[3].width });
      x += columns[3].width;
      doc.text(row.days_present.toString(), x, y, { width: columns[4].width });
      x += columns[4].width;
      doc.text(row.total_check_ins.toString(), x, y, { width: columns[5].width });
      x += columns[5].width;
      doc.text((row.total_work_minutes / 60).toFixed(2), x, y, { width: columns[6].width });
      x += columns[6].width;
      doc.text((row.avg_daily_work_minutes / 60).toFixed(2), x, y, { width: columns[7].width });
      x += columns[7].width;
      doc.text(row.total_late_count.toString(), x, y, { width: columns[8].width });
      x += columns[8].width;
      doc.text(row.total_early_departure_count.toString(), x, y, { width: columns[9].width });
      x += columns[9].width;
      doc.text(row.total_missing_checkout_count.toString(), x, y, { width: columns[10].width });

      y += rowHeight;
    }

    this.addFooter(doc, pageNumber);
    doc.end();

    return new Promise((resolve, reject) => {
      doc.on('finish', resolve);
      doc.on('error', reject);
    });
  }

  async exportMonthlyReport(data: MonthlyAttendanceSummary[], output: Writable): Promise<void> {
    const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });
    doc.pipe(output);

    this.addHeader(doc, 'Monthly Attendance Summary');

    const tableTop = 150;
    const rowHeight = 25;
    const fontSize = 8;
    let y = tableTop;
    let pageNumber = 1;

    const columns = [
      { header: 'Year', width: 50 },
      { header: 'Month', width: 50 },
      { header: 'Office', width: 80 },
      { header: 'Employee', width: 100 },
      { header: 'Dept', width: 60 },
      { header: 'Days', width: 40 },
      { header: 'Check-ins', width: 50 },
      { header: 'Work (hrs)', width: 60 },
      { header: 'Late', width: 40 },
      { header: 'Early', width: 40 },
      { header: 'Miss CO', width: 50 },
    ];

    doc.fontSize(fontSize).font('Helvetica-Bold');
    let x = 50;
    columns.forEach((col) => {
      doc.text(col.header, x, y, { width: col.width, align: 'left' });
      x += col.width;
    });

    doc.font('Helvetica');
    y += rowHeight;

    for (const row of data) {
      if (y > doc.page.height - 100) {
        this.addFooter(doc, pageNumber);
        doc.addPage({ margin: 50, size: 'A4', layout: 'landscape' });
        pageNumber++;
        y = 50;

        doc.fontSize(fontSize).font('Helvetica-Bold');
        x = 50;
        columns.forEach((col) => {
          doc.text(col.header, x, y, { width: col.width, align: 'left' });
          x += col.width;
        });
        doc.font('Helvetica');
        y += rowHeight;
      }

      x = 50;
      doc.fontSize(fontSize).text(row.year.toString(), x, y, { width: columns[0].width });
      x += columns[0].width;
      doc.text(row.month.toString(), x, y, { width: columns[1].width });
      x += columns[1].width;
      doc.text(row.office_name, x, y, { width: columns[2].width });
      x += columns[2].width;
      doc.text(row.full_name, x, y, { width: columns[3].width });
      x += columns[3].width;
      doc.text(row.department || 'N/A', x, y, { width: columns[4].width });
      x += columns[4].width;
      doc.text(row.days_present.toString(), x, y, { width: columns[5].width });
      x += columns[5].width;
      doc.text(row.total_check_ins.toString(), x, y, { width: columns[6].width });
      x += columns[6].width;
      doc.text(row.total_work_hours.toFixed(2), x, y, { width: columns[7].width });
      x += columns[7].width;
      doc.text(row.total_late_count.toString(), x, y, { width: columns[8].width });
      x += columns[8].width;
      doc.text(row.total_early_departure_count.toString(), x, y, { width: columns[9].width });
      x += columns[9].width;
      doc.text(row.total_missing_checkout_count.toString(), x, y, { width: columns[10].width });

      y += rowHeight;
    }

    this.addFooter(doc, pageNumber);
    doc.end();

    return new Promise((resolve, reject) => {
      doc.on('finish', resolve);
      doc.on('error', reject);
    });
  }

  async exportOccupancyReport(data: OfficeOccupancySummary[], output: Writable): Promise<void> {
    const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });
    doc.pipe(output);

    this.addHeader(doc, 'Office Occupancy Summary');

    const tableTop = 150;
    const rowHeight = 25;
    const fontSize = 8;
    let y = tableTop;
    let pageNumber = 1;

    const columns = [
      { header: 'Date', width: 70 },
      { header: 'Hour', width: 50 },
      { header: 'Office', width: 100 },
      { header: 'City', width: 80 },
      { header: 'Country', width: 80 },
      { header: 'Users', width: 50 },
      { header: 'Check-ins', width: 60 },
      { header: 'Departments', width: 180 },
    ];

    doc.fontSize(fontSize).font('Helvetica-Bold');
    let x = 50;
    columns.forEach((col) => {
      doc.text(col.header, x, y, { width: col.width, align: 'left' });
      x += col.width;
    });

    doc.font('Helvetica');
    y += rowHeight;

    for (const row of data) {
      if (y > doc.page.height - 100) {
        this.addFooter(doc, pageNumber);
        doc.addPage({ margin: 50, size: 'A4', layout: 'landscape' });
        pageNumber++;
        y = 50;

        doc.fontSize(fontSize).font('Helvetica-Bold');
        x = 50;
        columns.forEach((col) => {
          doc.text(col.header, x, y, { width: col.width, align: 'left' });
          x += col.width;
        });
        doc.font('Helvetica');
        y += rowHeight;
      }

      x = 50;
      doc
        .fontSize(fontSize)
        .text(this.formatDate(row.occupancy_date), x, y, { width: columns[0].width });
      x += columns[0].width;
      doc.text(`${row.hour.toString().padStart(2, '0')}:00`, x, y, { width: columns[1].width });
      x += columns[1].width;
      doc.text(row.office_name, x, y, { width: columns[2].width });
      x += columns[2].width;
      doc.text(row.city || 'N/A', x, y, { width: columns[3].width });
      x += columns[3].width;
      doc.text(row.country || 'N/A', x, y, { width: columns[4].width });
      x += columns[4].width;
      doc.text(row.unique_users.toString(), x, y, { width: columns[5].width });
      x += columns[5].width;
      doc.text(row.total_check_ins.toString(), x, y, { width: columns[6].width });
      x += columns[6].width;
      doc.text(
        Array.isArray(row.departments_present)
          ? row.departments_present.join(', ')
          : 'N/A',
        x,
        y,
        { width: columns[7].width }
      );

      y += rowHeight;
    }

    this.addFooter(doc, pageNumber);
    doc.end();

    return new Promise((resolve, reject) => {
      doc.on('finish', resolve);
      doc.on('error', reject);
    });
  }

  async exportReport(
    reportType: ReportType,
    data: any[],
    output: Writable
  ): Promise<void> {
    switch (reportType) {
      case 'daily':
        return this.exportDailyReport(data, output);
      case 'weekly':
        return this.exportWeeklyReport(data, output);
      case 'monthly':
        return this.exportMonthlyReport(data, output);
      case 'occupancy':
        return this.exportOccupancyReport(data, output);
      default:
        throw new Error(`Unsupported report type: ${reportType}`);
    }
  }
}
