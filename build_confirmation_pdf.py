import os
import sys

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_header_footer(num_pages)
            super().showPage()
        super().save()

    def draw_header_footer(self, page_count):
        self.saveState()
        
        # Draw running header on page 2 and onwards
        if self._pageNumber > 1:
            self.setFont("Helvetica-Bold", 8)
            self.setFillColor(colors.HexColor("#0F294A"))
            self.drawString(36, 815, "DYNAMIC FOOD CLEARING HOUSE (AIT-201)")
            self.setFont("Helvetica", 8)
            self.setFillColor(colors.HexColor("#475569"))
            self.drawRightString(559, 815, "Person 3: Data Architect & Pipeline Lead — Confirmation & Execution Plan")
            self.setStrokeColor(colors.HexColor("#CBD5E1"))
            self.setLineWidth(0.6)
            self.line(36, 808, 559, 808)
        
        # Running footer on all pages
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.6)
        self.line(36, 36, 559, 36)
        
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor("#64748B"))
        self.drawString(36, 24, "CONFIDENTIAL & PROPRIETARY — AIT-201 APPLIED MACHINE LEARNING")
        
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#475569"))
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(559, 24, page_str)
        self.restoreState()


def build_pdf(filename="docs/Confirmation_Person3_Data_Architect.pdf"):
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=40,
        bottomMargin=42
    )
    
    usable_width = 595.27 - 72  # 523.27 pt
    
    # Custom Palette
    C_PRIMARY = colors.HexColor("#0F294A")      # Deep Navy
    C_SECONDARY = colors.HexColor("#1D4ED8")    # Royal Blue
    C_DARK = colors.HexColor("#1E293B")         # Charcoal Slate
    C_MUTED = colors.HexColor("#64748B")        # Slate Muted
    C_LIGHT_BG = colors.HexColor("#F8FAFC")     # Clean Light Slate
    C_BORDER = colors.HexColor("#CBD5E1")       # Border grey
    C_CARD_BG = colors.HexColor("#F1F5F9")      # Card background
    
    # Custom Typography Styles
    badge_style = ParagraphStyle(
        "TitleBadge",
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#D97706")
    )
    
    main_title_style = ParagraphStyle(
        "MainTitle",
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=C_PRIMARY
    )
    
    subtitle_style = ParagraphStyle(
        "Subtitle",
        fontName="Helvetica",
        fontSize=9.5,
        leading=13,
        textColor=C_SECONDARY
    )
    
    meta_label = ParagraphStyle(
        "MetaLabel",
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=9.5,
        textColor=C_MUTED
    )
    
    meta_val = ParagraphStyle(
        "MetaVal",
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        textColor=C_DARK
    )
    
    h1_style = ParagraphStyle(
        "Heading1_Custom",
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        textColor=C_PRIMARY,
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )
    
    h2_style = ParagraphStyle(
        "Heading2_Custom",
        fontName="Helvetica-Bold",
        fontSize=9.5,
        leading=13,
        textColor=C_SECONDARY,
        spaceBefore=8,
        spaceAfter=3,
        keepWithNext=True
    )
    
    body_style = ParagraphStyle(
        "Body_Custom",
        fontName="Helvetica",
        fontSize=8,
        leading=11.2,
        textColor=C_DARK,
        spaceAfter=4
    )
    
    body_bold = ParagraphStyle(
        "Body_Bold",
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=11.2,
        textColor=C_DARK
    )
    
    bullet_style = ParagraphStyle(
        "Bullet_Custom",
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=C_DARK,
        leftIndent=10,
        firstLineIndent=-6,
        spaceAfter=2
    )
    
    callout_style = ParagraphStyle(
        "Callout_Text",
        fontName="Helvetica",
        fontSize=7.8,
        leading=10.5,
        textColor=colors.HexColor("#0F172A")
    )
    
    code_box_style = ParagraphStyle(
        "Code_Box",
        fontName="Courier",
        fontSize=6.8,
        leading=8.8,
        textColor=colors.HexColor("#0F172A")
    )
    
    th_style = ParagraphStyle(
        "TableHeader",
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=9.5,
        textColor=colors.white,
        alignment=0
    )
    
    td_style = ParagraphStyle(
        "TableCell",
        fontName="Helvetica",
        fontSize=7.2,
        leading=9.2,
        textColor=C_DARK
    )
    
    td_bold_style = ParagraphStyle(
        "TableCellBold",
        fontName="Helvetica-Bold",
        fontSize=7.2,
        leading=9.2,
        textColor=C_DARK
    )
    
    td_code_style = ParagraphStyle(
        "TableCellCode",
        fontName="Courier-Bold",
        fontSize=6.8,
        leading=8.8,
        textColor=C_PRIMARY
    )

    story = []
    
    # =========================================================================
    # PAGE 1: TITLE BANNER, METADATA, ROLE MISSION & ARCHITECTURE OVERVIEW
    # =========================================================================
    banner_p = Paragraph("<b>OFFICIAL SPECIFICATION &amp; TASK CONFIRMATION &bull; AIT-201 APPLIED ML</b>", badge_style)
    title_p = Paragraph("PERSON 3: DATA ARCHITECT &amp; PIPELINE LEAD", main_title_style)
    sub_p = Paragraph("End-to-End Technical Execution Plan: Single-Source Batch Pipeline (BASE) &amp; Multi-Source Canonical Simulation (UPGRADE)", subtitle_style)
    
    header_table = Table([[banner_p], [title_p], [sub_p]], colWidths=[usable_width])
    header_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_LIGHT_BG),
        ('BOX', (0,0), (-1,-1), 1.2, C_SECONDARY),
        ('PADDING', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,0), 2),
        ('BOTTOMPADDING', (0,1), (-1,1), 3),
        ('BOTTOMPADDING', (0,2), (-1,2), 4),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 6))
    
    # Metadata Grid
    meta_data = [
        [
            Paragraph("ROLE / ASSIGNEE", meta_label),
            Paragraph("<b>Person 3 &bull; Data Architect &amp; Pipeline Lead</b>", meta_val),
            Paragraph("STATUS", meta_label),
            Paragraph("<font color='#16A34A'><b>CONFIRMED &bull; READY TO EXECUTE</b></font>", meta_val),
        ],
        [
            Paragraph("PHASE 1 (BASE)", meta_label),
            Paragraph("Goal 4 Base (Single-Store ETL &rarr; <code>lots_base.csv</code>)", meta_val),
            Paragraph("BOTTLENECK", meta_label),
            Paragraph("<b>NONE</b> (100% Day 1 Independent Work)", meta_val),
        ],
        [
            Paragraph("PHASE 2 (UPGRADE)", meta_label),
            Paragraph("Goal 3 (Canonical Schema) + Goal 4 Full (Event Simulator)", meta_val),
            Paragraph("LOCALIZATION", meta_label),
            Paragraph("Malaysia (MYR Currency, Klang Valley, UTC+8)", meta_val),
        ],
        [
            Paragraph("CORE ARTIFACTS", meta_label),
            Paragraph("<code>process_store_inventory.py</code>, <code>validate_lots_base.py</code>, <code>lots_base.csv</code>", meta_val),
            Paragraph("ANCHOR DATE", meta_label),
            Paragraph("2026-10-30 (Aligned with Frontend &amp; DOSM)", meta_val),
        ]
    ]
    meta_table = Table(meta_data, colWidths=[85, 195, 75, 168])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.white),
        ('BOX', (0,0), (-1,-1), 0.8, C_BORDER),
        ('INNERGRID', (0,0), (-1,-1), 0.4, C_BORDER),
        ('PADDING', (0,0), (-1,-1), 4.5),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 6))
    
    # Section 1
    story.append(Paragraph("1. Role Mandate &amp; Strategic Architectural Positioning", h1_style))
    story.append(HRFlowable(width="100%", thickness=0.8, color=C_SECONDARY, spaceBefore=1, spaceAfter=5))
    
    story.append(Paragraph(
        "<b>1.1 Definitive Mission: The Foundation &amp; Single Source of Truth</b><br/>"
        "Dalam arsitektur <i>Dynamic Food Clearing House</i>, Person 3 (Data Architect &amp; Pipeline Lead) memegang peran vital "
        "sebagai <b>penyedia data tunggal yang berwibawa (Single Source of Truth)</b>. Seluruh model machine learning dan logika aplikasi "
        "— Model Klasifikasi Kerusakan FEFO (Person 1), Peramalan Permintaan (Person 2), Rule Engine Diskon Dinamis &amp; Cloud DB Supabase (Person 4), "
        "Scoring Risiko Waste &amp; Smart Dispatch OSRM (Person 5), serta Web Dashboard Toko 6-Langkah (Person 6) — <b>100% bergantung langsung "
        "pada kebersihan, format standar, dan konsistensi skema tabel yang dihasilkan oleh pipeline Person 3</b>.",
        body_style
    ))
    
    # FAQ Callout
    faq_data = [[
        Paragraph(
            "<b>PANDUAN STRATEGIS &amp; RESOLUSI FAQ RESMI:</b><br/>"
            "&bull; <b>Apakah di Fase 1 (BASE) Person 3 harus menggabungkan 5 dataset sekaligus?</b><br/>"
            "<b>TIDAK SAMA SEKALI!</b> Sesuai dokumen <code>FAQ.md</code> dan <code>PEMBAGIAN_TUGAS.md</code>, di Fase 1 fokus Anda <b>hanya</b> "
            "mengolah 1 dataset inventaris mentah (<code>Grocery_Inventory new v1.csv</code>) menjadi <b><code>lots_base.csv</code></b>. "
            "Pekerjaan menggabungkan 5 dataset (Canonical Schema) adalah tugas Fase 2 (UPGRADE).<br/>"
            "&bull; <b>Mandat Eksekusi Bebas Bottleneck (Day 1):</b> Anda dapat langsung memproses data inventaris lokal tanpa menunggu anggota lain.",
            callout_style
        )
    ]]
    faq_table = Table(faq_data, colWidths=[usable_width])
    faq_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#FEF3C7")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#F59E0B")),
        ('PADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(faq_table)
    story.append(Spacer(1, 6))
    
    story.append(Paragraph(
        "<b>1.2 Diagram Aliran Data &amp; Interkoneksi Modul Tim:</b>",
        body_bold
    ))
    
    flow_diagram_text = Paragraph(
        "<code>[Input Data: Grocery_Inventory new v1.csv / cleaned] &rarr; [src/etl/process_store_inventory.py]<br/>"
        "   &boxvr;&boxh;&boxh; 1. Fix Typo 'Catagory' &rarr; 'Category' &amp; Cabbage NaN &rarr; 'Produce'<br/>"
        "   &boxvr;&boxh;&boxh; 2. Currency Cleansing: Regex '$' &rarr; Float &rarr; unit_price_myr (MYR)<br/>"
        "   &boxvr;&boxh;&boxh; 3. Date Harmonization: 'M/D/YYYY' &rarr; ISO-8601 'YYYY-MM-DD'<br/>"
        "   &boxvr;&boxh;&boxh; 4. Temporal Anchoring: Kalibrasi DTE (1-12 hari) relatif thd Anchor Date (2026-10-30)<br/>"
        "   &boxur;&boxh;&boxh; 5. Feature Engineering: shelf_life_days, turnover_ratio, stock_pressure<br/>"
        "                       &darr;<br/>"
        "        [OUTPUT BASE UTAMA: data/processed/lots_base.csv]<br/>"
        "        &boxvr;&boxh;&boxh;&rarr; Person 1 (ML): spoilage_classifier.pkl &amp; sort_by_fefo()<br/>"
        "        &boxvr;&boxh;&boxh;&rarr; Person 2 (API): FastAPI GET /api/lots &amp; demand matching<br/>"
        "        &boxvr;&boxh;&boxh;&rarr; Person 4 (BE): Supabase 'batches' Table Ingestion &amp; assign_route()<br/>"
        "        &boxvr;&boxh;&boxh;&rarr; Person 5 (GIS): OSRM Dispatch Route, polyline &amp; food bank matching<br/>"
        "        &boxur;&boxh;&boxh;&rarr; Person 6 (FE): 6-Step Store Dashboard &amp; Leaflet Route Preview</code>",
        code_box_style
    )
    flow_box = Table([[flow_diagram_text]], colWidths=[usable_width])
    flow_box.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_CARD_BG),
        ('BOX', (0,0), (-1,-1), 0.8, C_BORDER),
        ('PADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(flow_box)
    
    # End of Page 1
    story.append(PageBreak())
    
    # =========================================================================
    # PAGE 2: PHASE 1 (BASE) SPECIFICATION & LOTS_BASE.CSV SCHEMA
    # =========================================================================
    story.append(Paragraph("2. Phase 1 (BASE) Technical Specification — Single-Store Batch Pipeline (Goal 4 Base)", h1_style))
    story.append(HRFlowable(width="100%", thickness=0.8, color=C_SECONDARY, spaceBefore=1, spaceAfter=5))
    
    story.append(Paragraph(
        "<b>2.1 Aturan Pembersihan Data &amp; Rekayasa Fitur (Cleansing Rules):</b>",
        body_bold
    ))
    story.append(Paragraph(
        "&bull; <b>Typo &amp; Null Handling:</b> Standarisasi kolom header <code>Catagory</code> &rarr; <code>Category</code>. "
        "Imputasi baris 574 Cabbage (null) secara terarah dengan <code>'Produce'</code> berbasis pengetahuan domain retail.",
        bullet_style
    ))
    story.append(Paragraph(
        "&bull; <b>Pembersihan &amp; Konversi Mata Uang:</b> Kolom mentah <code>Unit_Price</code> berformat string dengan simbol dollar (<code>$4.60</code>). "
        "Diekstrak nilai numerik menggunakan Regex <code>[^0-9.]</code> lalu dikonversi ke Ringgit Malaysia (kurs 1 USD &approx; 4.45 MYR) "
        "menjadi kolom numerik <code>unit_price_myr</code>.",
        bullet_style
    ))
    story.append(Paragraph(
        "&bull; <b>Standardisasi Format Tanggal:</b> Konversi seluruh format tanggal <code>M/D/YYYY</code> ke ISO-8601 (<code>YYYY-MM-DD</code>) "
        "agar seragam dengan Supabase PostgreSQL dan JavaScript frontend.",
        bullet_style
    ))
    story.append(Paragraph(
        "&bull; <b>Strategi Temporal Anchoring:</b> Dataset Kaggle statis bertanggal 2024–2025. Jika dihitung ke tahun 2026, <code>days_to_expiry</code> "
        "akan negatif dan merusak alur FEFO. Pipeline menerapkan <b>Anchor Date</b> (<code>2026-10-30</code>) dan kalibrasi siklus 1–12 hari expiry "
        "sehingga tercipta sebaran realistis untuk mendemonstrasikan diskon dinamis dan donasi pangan.",
        bullet_style
    ))
    story.append(Paragraph(
        "&bull; <b>Pre-Computation Fitur ML (Kontrak Person 1):</b> Menghitung fitur turunan <code>shelf_life_days = (Expiration_Date - Date_Received).days</code>, "
        "<code>turnover_ratio = Inventory_Turnover_Rate</code>, dan <code>stock_pressure = Stock_Quantity / (Reorder_Level + 1)</code>.",
        bullet_style
    ))
    story.append(Spacer(1, 4))
    
    story.append(Paragraph("<b>2.2 Kamus Skema Kolom Deliverable Utama: <code>data/processed/lots_base.csv</code></b>", body_bold))
    
    # Table lots_base.csv Schema (11 data rows)
    schema_cols = [60, 75, 65, 140, 65, 118]
    schema_headers = [
        Paragraph("Field Name", th_style),
        Paragraph("SQL / Py Type", th_style),
        Paragraph("Constraints", th_style),
        Paragraph("Description &amp; Business Meaning", th_style),
        Paragraph("Sample Value", th_style),
        Paragraph("Consumers", th_style),
    ]
    schema_rows = [
        schema_headers,
        [
            Paragraph("lot_id", td_code_style),
            Paragraph("VARCHAR(32)", td_style),
            Paragraph("PK, NOT NULL", td_bold_style),
            Paragraph("Identifier unik tiap lot stok barang.", td_style),
            Paragraph("<code>LOT-1001</code>", td_style),
            Paragraph("Person 1, 2, 4, 5, 6", td_style),
        ],
        [
            Paragraph("product_name", td_code_style),
            Paragraph("VARCHAR(128)", td_style),
            Paragraph("NOT NULL", td_bold_style),
            Paragraph("Nama komoditas bahan pangan, Title Case.", td_style),
            Paragraph("Organic Spinach", td_style),
            Paragraph("Person 2, 4, 6", td_style),
        ],
        [
            Paragraph("category", td_code_style),
            Paragraph("VARCHAR(64)", td_style),
            Paragraph("NOT NULL", td_bold_style),
            Paragraph("Kategori: Produce, Dairy, Meat, Bakery, Pantry.", td_style),
            Paragraph("Produce", td_style),
            Paragraph("Person 1, 4, 5, 6", td_style),
        ],
        [
            Paragraph("quantity", td_code_style),
            Paragraph("INTEGER", td_style),
            Paragraph("NOT NULL, > 0", td_bold_style),
            Paragraph("Kuantitas fisik stok dalam unit atau kilogram.", td_style),
            Paragraph("46", td_style),
            Paragraph("Person 1, 2, 4, 5, 6", td_style),
        ],
        [
            Paragraph("expiry_date", td_code_style),
            Paragraph("DATE (ISO)", td_style),
            Paragraph("YYYY-MM-DD", td_bold_style),
            Paragraph("Tanggal batas kedaluwarsa resmi produsen.", td_style),
            Paragraph("2026-11-02", td_style),
            Paragraph("Person 1, 2, 4, 6", td_style),
        ],
        [
            Paragraph("unit_price_myr", td_code_style),
            Paragraph("NUMERIC(8,2)", td_style),
            Paragraph("NOT NULL, > 0", td_bold_style),
            Paragraph("Harga jual reguler per unit dalam Ringgit Malaysia.", td_style),
            Paragraph("20.47", td_style),
            Paragraph("Person 4 (Markdown), 6", td_style),
        ],
        [
            Paragraph("store_id", td_code_style),
            Paragraph("VARCHAR(32)", td_style),
            Paragraph("NOT NULL", td_bold_style),
            Paragraph("Kode cabang supermarket di Lembah Klang.", td_style),
            Paragraph("MY-KL-001", td_style),
            Paragraph("Person 2, 4, 5, 6", td_style),
        ],
        [
            Paragraph("shelf_life_days", td_code_style),
            Paragraph("INTEGER", td_style),
            Paragraph("&gt;= 1", td_bold_style),
            Paragraph("Total masa simpan (Expiration Date - Date Received).", td_style),
            Paragraph("8", td_style),
            Paragraph("Person 1 (Spoilage ML)", td_style),
        ],
        [
            Paragraph("days_to_expiry", td_code_style),
            Paragraph("INTEGER", td_style),
            Paragraph("&gt;= 0", td_bold_style),
            Paragraph("Sisa umur lot terhadap tanggal operasional (DTE).", td_style),
            Paragraph("3", td_style),
            Paragraph("Person 1, 4, 6", td_style),
        ],
        [
            Paragraph("turnover_ratio", td_code_style),
            Paragraph("NUMERIC(6,2)", td_style),
            Paragraph("&gt;= 0.0", td_bold_style),
            Paragraph("Kecepatan perputaran stok barang di gudang ritel.", td_style),
            Paragraph("1.96", td_style),
            Paragraph("Person 1 (Spoilage ML)", td_style),
        ],
        [
            Paragraph("stock_pressure", td_code_style),
            Paragraph("NUMERIC(6,2)", td_style),
            Paragraph("&gt;= 0.0", td_bold_style),
            Paragraph("Rasio stok saat ini terhadap Reorder Level toko.", td_style),
            Paragraph("0.71", td_style),
            Paragraph("Person 1 (Spoilage ML)", td_style),
        ],
    ]
    schema_table = Table(schema_rows, colWidths=schema_cols)
    schema_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), C_PRIMARY),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('INNERGRID', (0,0), (-1,-1), 0.35, C_BORDER),
        ('BOX', (0,0), (-1,-1), 0.8, C_PRIMARY),
        ('PADDING', (0,0), (-1,-1), 2.8),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, C_LIGHT_BG]),
    ]))
    story.append(schema_table)
    story.append(Spacer(1, 6))
    
    story.append(Paragraph(
        "<b>2.3 Cuplikan Logika Script ETL (<code>src/etl/process_store_inventory.py</code>):</b>",
        body_bold
    ))
    code_snippet = Paragraph(
        "<code>def process_store_inventory(input_path, output_path, anchor_date=datetime(2026, 10, 30)):<br/>"
        "    df = pd.read_csv(input_path).rename(columns={'Catagory': 'Category'})<br/>"
        "    df.loc[(df['Product_Name'] == 'Cabbage') &amp; (df['Category'].isna()), 'Category'] = 'Produce'<br/>"
        "    df['unit_price_myr'] = (df['Unit_Price'].replace(r'[\\$,]', '', regex=True).astype(float) * 4.45).round(2)<br/>"
        "    df['shelf_life_days'] = (pd.to_datetime(df['Expiration_Date']) - pd.to_datetime(df['Date_Received'])).dt.days.clip(lower=1)<br/>"
        "    df['days_to_expiry'] = ((df.index % 12) + 1)  # Calibrated cycle 1-12 DTE relative to anchor<br/>"
        "    df['stock_pressure'] = (df['Stock_Quantity'] / (df['Reorder_Level'] + 1)).round(2)<br/>"
        "    df.to_csv(output_path, index=False)</code>",
        code_box_style
    )
    snippet_box = Table([[code_snippet]], colWidths=[usable_width])
    snippet_box.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_CARD_BG),
        ('BOX', (0,0), (-1,-1), 0.8, C_BORDER),
        ('PADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(snippet_box)
    
    # End of Page 2
    story.append(PageBreak())
    
    # =========================================================================
    # PAGE 3: INTEGRITY VALIDATION & PHASE 2 (UPGRADE) CANONICAL SIMULATION
    # =========================================================================
    story.append(Paragraph("3. Data Quality Assurance &amp; Automated Validation Suite (`validate_lots_base.py`)", h1_style))
    story.append(HRFlowable(width="100%", thickness=0.8, color=C_SECONDARY, spaceBefore=1, spaceAfter=5))
    
    story.append(Paragraph(
        "Untuk menjamin tidak ada data anomali yang lolos ke database Supabase atau pipeline ML, Person 3 membangun "
        "skrip otomatis <code>src/etl/validate_lots_base.py</code> yang memverifikasi <b>7 Golden Rules of Pipeline Integrity</b>:",
        body_style
    ))
    
    val_cols = [24, 115, 230, 154]
    val_headers = [
        Paragraph("No", th_style),
        Paragraph("Integrity Rule", th_style),
        Paragraph("Verification Logic &amp; Condition", th_style),
        Paragraph("Defensive Action on Fail", th_style),
    ]
    val_rows = [
        val_headers,
        [
            Paragraph("1", td_bold_style),
            Paragraph("Zero Missing Primary Keys", td_bold_style),
            Paragraph("<code>df['lot_id'].isna().sum() == 0</code>", td_code_style),
            Paragraph("Tolak batch, raise <code>ValueError</code>.", td_style),
        ],
        [
            Paragraph("2", td_bold_style),
            Paragraph("Primary Key Uniqueness", td_bold_style),
            Paragraph("<code>df['lot_id'].is_unique == True</code> (zero duplicates)", td_code_style),
            Paragraph("Hentikan pipeline, cegah duplikasi Supabase.", td_style),
        ],
        [
            Paragraph("3", td_bold_style),
            Paragraph("Strict Positive Quantities", td_bold_style),
            Paragraph("<code>(df['quantity'] > 0).all()</code>", td_code_style),
            Paragraph("Filter stok nol/negatif ke error log.", td_style),
        ],
        [
            Paragraph("4", td_bold_style),
            Paragraph("Sensible Price Boundary", td_bold_style),
            Paragraph("<code>(df['unit_price_myr'] >= 0.50).all()</code>", td_code_style),
            Paragraph("Imputasi median kategori DOSM PriceCatcher.", td_style),
        ],
        [
            Paragraph("5", td_bold_style),
            Paragraph("ISO-8601 Date Parsing", td_bold_style),
            Paragraph("Regex <code>^\\d{4}-\\d{2}-\\d{2}$</code> match on all rows", td_code_style),
            Paragraph("Konversi paksa dengan parser ISO fallback.", td_style),
        ],
        [
            Paragraph("6", td_bold_style),
            Paragraph("Non-Negative DTE", td_bold_style),
            Paragraph("<code>(df['days_to_expiry'] >= 0).all()</code>", td_code_style),
            Paragraph("Clip nilai negatif ke 0 (expired today).", td_style),
        ],
        [
            Paragraph("7", td_bold_style),
            Paragraph("Category Taxonomy Match", td_bold_style),
            Paragraph("<code>df['category'].isin(APPROVED_CATEGORIES)</code>", td_code_style),
            Paragraph("Mapping ke <code>'General Grocery'</code>.", td_style),
        ],
    ]
    val_table = Table(val_rows, colWidths=val_cols)
    val_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#065F46")),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('INNERGRID', (0,0), (-1,-1), 0.35, C_BORDER),
        ('BOX', (0,0), (-1,-1), 0.8, colors.HexColor("#065F46")),
        ('PADDING', (0,0), (-1,-1), 2.8),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, C_LIGHT_BG]),
    ]))
    story.append(val_table)
    story.append(Spacer(1, 8))
    
    # Section 4: Phase 2 (UPGRADE)
    story.append(Paragraph("4. Phase 2 (UPGRADE): Canonical Schema &amp; Discrete-Event Simulator Engine", h1_style))
    story.append(HRFlowable(width="100%", thickness=0.8, color=C_SECONDARY, spaceBefore=1, spaceAfter=5))
    
    story.append(Paragraph(
        "<b>4.1 Goal 3 — Canonical Schema 5 Dataset (`canonical_batch_table.csv`):</b><br/>"
        "Pada Fase Upgrade, sistem berkembang dari 1 toko menjadi simulator clearing house multi-cabang. Person 3 merancang skema kanonikal "
        "yang mengharmonisasikan 5 dataset heterogen lintas domain:",
        body_style
    ))
    
    canon_cols = [65, 110, 110, 115, 123]
    canon_headers = [
        Paragraph("Canonical Cat", th_style),
        Paragraph("Grocery Inventory", th_style),
        Paragraph("Perishable Goods", th_style),
        Paragraph("M5 / Favorita Family", th_style),
        Paragraph("DOSM PriceCatcher", th_style),
    ]
    canon_rows = [
        canon_headers,
        [
            Paragraph("Produce", td_bold_style),
            Paragraph("Fruits &amp; Vegetables", td_style),
            Paragraph("Produce, Vegetables, Fruits", td_style),
            Paragraph("PRODUCE", td_code_style),
            Paragraph("Sayur-Sayuran, Buah-Buahan", td_style),
        ],
        [
            Paragraph("Dairy", td_bold_style),
            Paragraph("Dairy", td_style),
            Paragraph("Dairy &amp; Eggs", td_style),
            Paragraph("DAIRY", td_code_style),
            Paragraph("Susu &amp; Produk Tenusu", td_style),
        ],
        [
            Paragraph("Meat", td_bold_style),
            Paragraph("Meat &amp; Poultry", td_style),
            Paragraph("Meat, Poultry, Seafood", td_style),
            Paragraph("MEATS, POULTRY, SEAFOOD", td_code_style),
            Paragraph("Daging Segar, Ayam, Laut", td_style),
        ],
        [
            Paragraph("Bakery", td_bold_style),
            Paragraph("Bakery", td_style),
            Paragraph("Bakery &amp; Bread", td_style),
            Paragraph("BREAD/BAKERY", td_code_style),
            Paragraph("Roti &amp; Barangan Bakeri", td_style),
        ],
        [
            Paragraph("Pantry", td_bold_style),
            Paragraph("Canned Goods, Grains", td_style),
            Paragraph("Dry Goods, Canned", td_style),
            Paragraph("GROCERY I, GROCERY II", td_code_style),
            Paragraph("Barangan Kering, Beras", td_style),
        ],
    ]
    canon_table = Table(canon_rows, colWidths=canon_cols)
    canon_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#312E81")),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('INNERGRID', (0,0), (-1,-1), 0.35, C_BORDER),
        ('BOX', (0,0), (-1,-1), 0.8, colors.HexColor("#312E81")),
        ('PADDING', (0,0), (-1,-1), 2.8),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, C_LIGHT_BG]),
    ]))
    story.append(canon_table)
    story.append(Spacer(1, 6))
    
    story.append(Paragraph(
        "<b>4.2 Goal 4 Full — Discrete-Event Simulator Engine (`simulation_events.csv`):</b><br/>"
        "Mensimulasikan dinamika surplus 3–5 supermarket di Lembah Klang selama horizon 30–90 hari. "
        "Sesuai arahan arsitektur retail (Step 7–14), <b>DILARANG MENGGUNAKAN EVENT PERTANIAN (Harvested/Shipped)</b>. "
        "Engine hanya menggunakan 5 siklus event ritel resmi:",
        body_style
    ))
    
    event_p = Paragraph(
        "<code>[ received ] &rarr; [ active_fefo ] &rarr; [ markdown ] &rarr; [ dispatched ] (Food Bank via OSRM)<br/>"
        "                                       &searr; [ wasted ] (Landfill / Rusak)</code>",
        code_box_style
    )
    event_box = Table([[event_p]], colWidths=[usable_width])
    event_box.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_CARD_BG),
        ('BOX', (0,0), (-1,-1), 0.8, C_BORDER),
        ('PADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(event_box)
    
    # End of Page 3
    story.append(PageBreak())
    
    # =========================================================================
    # PAGE 4: TEAM INTEGRATION CONTRACTS & FORMAL SIGN-OFF
    # =========================================================================
    story.append(Paragraph("5. Cross-Functional Team Interoperability Contract Matrix", h1_style))
    story.append(HRFlowable(width="100%", thickness=0.8, color=C_SECONDARY, spaceBefore=1, spaceAfter=5))
    
    story.append(Paragraph(
        "Person 3 berinteraksi langsung dengan seluruh rekan tim melalui kontrak data formal berikut:",
        body_style
    ))
    
    team_cols = [70, 42, 125, 158, 128]
    team_headers = [
        Paragraph("Team Member", th_style),
        Paragraph("Flow", th_style),
        Paragraph("Artifact / Endpoint", th_style),
        Paragraph("Contract Schema &amp; Fields", th_style),
        Paragraph("Integration Guarantee", th_style),
    ]
    team_rows = [
        team_headers,
        [
            Paragraph("Person 0<br/>(Dataset Quality)", td_bold_style),
            Paragraph("IN", td_bold_style),
            Paragraph("<code>Grocery_Inventory_cleaned</code>,<br/><code>holidays_my.csv</code>, <code>item.parquet</code>", td_code_style),
            Paragraph("Typo <code>Catagory</code> diperbaiki, Cabbage diisi <code>'Produce'</code>, tabel lookup DOSM MYR.", td_style),
            Paragraph("Person 3 mengonsumsi file bersih sebagai basis ETL.", td_style),
        ],
        [
            Paragraph("Person 1<br/>(Tech Lead &amp; ML)", td_bold_style),
            Paragraph("OUT", td_bold_style),
            Paragraph("<code>data/processed/lots_base.csv</code>", td_code_style),
            Paragraph("<code>shelf_life_days</code>, <code>turnover_ratio</code>, <code>stock_pressure</code>, <code>category</code>, <code>days_to_expiry</code>.", td_style),
            Paragraph("Format 100% kompatibel dengan <code>src/ml/spoilage.py</code>.", td_style),
        ],
        [
            Paragraph("Person 2<br/>(Forecaster &amp; API)", td_bold_style),
            Paragraph("OUT", td_bold_style),
            Paragraph("<code>lots_base.csv</code> &rarr;<br/><code>GET /api/lots</code>", td_code_style),
            Paragraph("<code>lot_id</code>, <code>product_name</code>, <code>category</code>, <code>quantity</code>, <code>expiry_date</code>, <code>store_id</code>.", td_style),
            Paragraph("Person 2 membaca CSV untuk melayani endpoint REST API.", td_style),
        ],
        [
            Paragraph("Person 4<br/>(Logic &amp; Supabase)", td_bold_style),
            Paragraph("OUT", td_bold_style),
            Paragraph("Supabase Table: <code>batches</code><br/>(via <code>upload_batches.py</code>)", td_code_style),
            Paragraph("Seluruh kolom <code>lots_base.csv</code> di-upsert ke tabel PostgreSQL dengan RLS.", td_style),
            Paragraph("Zero schema mismatch; kolom Upgrade disiapkan NULL.", td_style),
        ],
        [
            Paragraph("Person 5<br/>(Risk &amp; OSRM)", td_bold_style),
            Paragraph("OUT", td_bold_style),
            Paragraph("<code>lots_base.csv</code> &rarr;<br/>OSRM Dispatch Engine", td_code_style),
            Paragraph("<code>lot_id</code>, <code>quantity</code> (kg), <code>category</code>, dan lokasi toko untuk rute OSRM.", td_style),
            Paragraph("Menjamin kuantitas surplus valid untuk kapasitas food bank.", td_style),
        ],
        [
            Paragraph("Person 6<br/>(Frontend UI)", td_bold_style),
            Paragraph("OUT", td_bold_style),
            Paragraph("Tabel Stok FEFO &amp;<br/>Web App React/Vite", td_code_style),
            Paragraph("Format DTE, label risiko, nama produk, dan harga satuan dalam Ringgit Malaysia (RM).", td_style),
            Paragraph("Langsung selaras dengan <code>inventoryData.js</code> frontend.", td_style),
        ],
    ]
    team_table = Table(team_rows, colWidths=team_cols)
    team_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), C_PRIMARY),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('INNERGRID', (0,0), (-1,-1), 0.35, C_BORDER),
        ('BOX', (0,0), (-1,-1), 0.8, C_PRIMARY),
        ('PADDING', (0,0), (-1,-1), 2.8),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, C_LIGHT_BG]),
    ]))
    story.append(team_table)
    story.append(Spacer(1, 8))
    
    # Section 6: Checklist & Sign-off
    story.append(Paragraph("6. Implementation Roadmap, Deliverables Checklist &amp; Sign-Off Matrix", h1_style))
    story.append(HRFlowable(width="100%", thickness=0.8, color=C_SECONDARY, spaceBefore=1, spaceAfter=5))
    
    check_cols = [24, 236, 80, 110, 73]
    check_headers = [
        Paragraph("No", th_style),
        Paragraph("Task Deliverable Description", th_style),
        Paragraph("Phase", th_style),
        Paragraph("Target File / Artifact", th_style),
        Paragraph("Status", th_style),
    ]
    check_rows = [
        check_headers,
        [
            Paragraph("1", td_bold_style),
            Paragraph("Pembersihan currency $, parsing tanggal ISO, dan kalibrasi anchor date.", td_style),
            Paragraph("BASE", td_bold_style),
            Paragraph("<code>src/etl/process_store_inventory.py</code>", td_code_style),
            Paragraph("<font color='#16A34A'><b>VERIFIED</b></font>", td_style),
        ],
        [
            Paragraph("2", td_bold_style),
            Paragraph("Ekspor dataset stok retail bersih 1.000 lot siap konsumsi Supabase.", td_style),
            Paragraph("BASE", td_bold_style),
            Paragraph("<code>data/processed/lots_base.csv</code>", td_code_style),
            Paragraph("<font color='#16A34A'><b>READY</b></font>", td_style),
        ],
        [
            Paragraph("3", td_bold_style),
            Paragraph("Script validasi integritas otomatis (7 Golden Rules test suite).", td_style),
            Paragraph("BASE", td_bold_style),
            Paragraph("<code>src/etl/validate_lots_base.py</code>", td_code_style),
            Paragraph("<font color='#16A34A'><b>READY</b></font>", td_style),
        ],
        [
            Paragraph("4", td_bold_style),
            Paragraph("Harmonisasi skema kanonikal 5 dataset pangan heterogen.", td_style),
            Paragraph("UPGRADE", td_bold_style),
            Paragraph("<code>canonical_batch_table.csv</code>", td_code_style),
            Paragraph("PLANNED", td_style),
        ],
        [
            Paragraph("5", td_bold_style),
            Paragraph("Multi-Store Discrete-Event Simulator Engine (5 event ritel).", td_style),
            Paragraph("UPGRADE", td_bold_style),
            Paragraph("<code>simulation_events.csv</code>", td_code_style),
            Paragraph("PLANNED", td_style),
        ],
    ]
    check_table = Table(check_rows, colWidths=check_cols)
    check_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1E3A8A")),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('INNERGRID', (0,0), (-1,-1), 0.35, C_BORDER),
        ('BOX', (0,0), (-1,-1), 0.8, colors.HexColor("#1E3A8A")),
        ('PADDING', (0,0), (-1,-1), 2.8),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, C_LIGHT_BG]),
    ]))
    story.append(check_table)
    story.append(Spacer(1, 8))
    
    # Official Sign-off Box
    signoff_p = Paragraph(
        "<b>PERNYATAAN RESMI KONFIRMASI TEKNIS (FORMAL SIGN-OFF &amp; AUTHORIZATION):</b><br/>"
        "Dengan diterbitkannya dokumen konfirmasi teknis ini, <b>Person 3 (Data Architect &amp; Pipeline Lead)</b> menyatakan kesiapan 100% "
        "untuk mengeksekusi pipeline data sesuai spesifikasi di atas. Arsitektur data telah diverifikasi selaras dengan model ML Person 1, "
        "kebutuhan database Supabase Person 4, OSRM Dispatch Person 5, dan web dashboard Person 6. "
        "Eksekusi Fase 1 (BASE) dimulai secara mandiri tanpa bottleneck.",
        callout_style
    )
    signoff_table = Table([[signoff_p]], colWidths=[usable_width])
    signoff_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#ECFDF5")),
        ('BOX', (0,0), (-1,-1), 1.2, colors.HexColor("#059669")),
        ('PADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(signoff_table)
    
    # Build Document
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"[SUCCESS] Confirmation PDF successfully generated at: {filename}")

if __name__ == "__main__":
    build_pdf()
