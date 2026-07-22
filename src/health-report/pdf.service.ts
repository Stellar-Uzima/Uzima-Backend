import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { ReportAggregation } from './aggregation.service';

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  async generateReportPdf(
    aggregation: ReportAggregation,
    userDisplayName: string
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        this.renderHeader(doc, aggregation, userDisplayName);
        this.renderInsight(doc, aggregation);
        this.renderCategoryTable(doc, aggregation);
        this.renderStreakSection(doc, aggregation);
        this.renderBadgesSection(doc, aggregation);
        this.renderConsultationsSection(doc, aggregation);
        this.renderFooter(doc);

        doc.end();
      } catch (error) {
        this.logger.error('Failed to generate report PDF', error as Error);
        reject(error);
      }
    });
  }

  private renderHeader(
    doc: PDFKit.PDFDocument,
    aggregation: ReportAggregation,
    userDisplayName: string
  ): void {
    doc.fontSize(22).fillColor('#1a4d3e').text('Weekly Health Report', { align: 'left' });

    doc.moveDown(0.3);
    doc
      .fontSize(11)
      .fillColor('#555555')
      .text(`${userDisplayName}`, { align: 'left' })
      .text(`Period: ${aggregation.periodStart} to ${aggregation.periodEnd}`, {
        align: 'left',
      });

    doc.moveDown(0.5);
    this.drawSectionRule(doc);
    doc.moveDown(0.8);
  }

  private renderInsight(doc: PDFKit.PDFDocument, aggregation: ReportAggregation): void {
    this.drawBoxedSection(doc, 'This Week\u2019s Insight', () => {
      doc.fontSize(11).fillColor('#1a1a1a').text(aggregation.insight, { align: 'left' });
    });
  }

  private renderCategoryTable(doc: PDFKit.PDFDocument, aggregation: ReportAggregation): void {
    this.drawSectionTitle(doc, 'Task Completion by Category');

    const startX = doc.x;
    let y = doc.y + 5;
    const colWidths = [160, 90, 90, 100];
    const headers = ['Category', 'Assigned', 'Completed', 'Rate'];

    doc.fontSize(10).fillColor('#ffffff');
    doc
      .rect(
        startX,
        y,
        colWidths.reduce((a, b) => a + b, 0),
        22
      )
      .fill('#1a4d3e');
    let x = startX;
    headers.forEach((header, i) => {
      doc.fillColor('#ffffff').text(header, x + 6, y + 6, { width: colWidths[i] - 6 });
      x += colWidths[i];
    });
    y += 22;

    aggregation.categoryStats.forEach((stat, rowIndex) => {
      const rowHeight = 20;
      const bg = rowIndex % 2 === 0 ? '#f4f4f4' : '#ffffff';
      doc
        .rect(
          startX,
          y,
          colWidths.reduce((a, b) => a + b, 0),
          rowHeight
        )
        .fill(bg);

      x = startX;
      const row = [
        this.capitalize(stat.category),
        String(stat.assigned),
        String(stat.completed),
        `${stat.completionRate}%`,
      ];
      row.forEach((cell, i) => {
        doc
          .fillColor('#1a1a1a')
          .fontSize(10)
          .text(cell, x + 6, y + 5, { width: colWidths[i] - 6 });
        x += colWidths[i];
      });
      y += rowHeight;
    });

    doc
      .rect(
        startX,
        y,
        colWidths.reduce((a, b) => a + b, 0),
        24
      )
      .fill('#e8f3ee');
    doc
      .fillColor('#1a4d3e')
      .fontSize(10)
      .text('Overall Completion Rate', startX + 6, y + 6, { width: 250 })
      .text(`${aggregation.overallCompletionRate}%`, startX + 260, y + 6);

    doc.y = y + 40;
    doc.x = startX;
  }

  private renderStreakSection(doc: PDFKit.PDFDocument, aggregation: ReportAggregation): void {
    this.drawBoxedSection(doc, 'Streak Summary', () => {
      doc
        .fontSize(11)
        .fillColor('#1a1a1a')
        .text(`Current streak: ${aggregation.streak.currentStreak} day(s)`)
        .text(`Longest streak this period: ${aggregation.streak.longestStreakInPeriod} day(s)`);
    });
  }

  private renderBadgesSection(doc: PDFKit.PDFDocument, aggregation: ReportAggregation): void {
    this.drawSectionTitle(doc, 'Badges Earned');

    if (aggregation.badgesEarned.length === 0) {
      doc.fontSize(10).fillColor('#777777').text('No badges earned yet \u2014 keep going!');
      doc.moveDown(0.8);
      return;
    }

    aggregation.badgesEarned.forEach((badge) => {
      doc.fontSize(11).fillColor('#1a4d3e').text(`\u2022 ${badge.name}`, { continued: false });
      doc.fontSize(9).fillColor('#666666').text(`  ${badge.description}`);
      doc.moveDown(0.2);
    });
    doc.moveDown(0.6);
  }

  private renderConsultationsSection(
    doc: PDFKit.PDFDocument,
    aggregation: ReportAggregation
  ): void {
    this.drawBoxedSection(doc, 'Consultations', () => {
      const c = aggregation.consultations;
      doc
        .fontSize(11)
        .fillColor('#1a1a1a')
        .text(`Total scheduled: ${c.totalScheduled}`)
        .text(`Completed: ${c.completed}`)
        .text(`Cancelled: ${c.cancelled}`);
    });
  }

  private renderFooter(doc: PDFKit.PDFDocument): void {
    doc.moveDown(1);
    this.drawSectionRule(doc);
    doc.moveDown(0.3);
    doc
      .fontSize(8)
      .fillColor('#999999')
      .text('Generated by Stellar Uzima \u2014 this report is personal to your account.', {
        align: 'center',
      });
  }

  private drawSectionTitle(doc: PDFKit.PDFDocument, title: string): void {
    doc.fontSize(13).fillColor('#1a4d3e').text(title, { align: 'left' });
    doc.moveDown(0.3);
  }

  private drawBoxedSection(doc: PDFKit.PDFDocument, title: string, renderBody: () => void): void {
    this.drawSectionTitle(doc, title);
    const startX = doc.x;
    const startY = doc.y;
    doc.moveDown(0.1);
    renderBody();
    const endY = doc.y;
    doc
      .rect(startX - 6, startY - 4, 495, endY - startY + 14)
      .lineWidth(0.5)
      .strokeColor('#dddddd')
      .stroke();
    doc.moveDown(0.8);
    doc.x = startX;
  }

  private drawSectionRule(doc: PDFKit.PDFDocument): void {
    const y = doc.y;
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#cccccc').lineWidth(1).stroke();
  }

  private capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
