import os
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=140, right=140):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f'''
        <w:tcMar {nsdecls("w")}>
            <w:top w:w="{top}" w:type="dxa"/>
            <w:bottom w:w="{bottom}" w:type="dxa"/>
            <w:left w:w="{left}" w:type="dxa"/>
            <w:right w:w="{right}" w:type="dxa"/>
        </w:tcMar>
    ''')
    tcPr.append(tcMar)

def add_hyperlink(paragraph, text, url, color="0056B3", underline=True):
    part = paragraph.part
    r_id = part.relate_to(url, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", is_external=True)
    hyperlink = parse_xml(f'<w:hyperlink {nsdecls("w", "r")} r:id="{r_id}" w:history="1"/>')
    new_run = parse_xml(f'<w:r {nsdecls("w")}><w:rPr/></w:r>')
    rPr = new_run.find(qn('w:rPr'))
    if color:
        c = parse_xml(f'<w:color {nsdecls("w")} w:val="{color}"/>')
        rPr.append(c)
    if underline:
        u = parse_xml(f'<w:u {nsdecls("w")} w:val="single"/>')
        rPr.append(u)
    text_node = parse_xml(f'<w:t {nsdecls("w")}>{text}</w:t>')
    new_run.append(text_node)
    hyperlink.append(new_run)
    paragraph._p.append(hyperlink)

def create_styled_table(doc, headers, data, col_widths=None):
    table = doc.add_table(rows=len(data) + 1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False

    # Header row
    hdr_cells = table.rows[0].cells
    for i, title in enumerate(headers):
        hdr_cells[i].text = title
        set_cell_background(hdr_cells[i], "1F3A24")  # Forest Green brand
        set_cell_margins(hdr_cells[i], top=120, bottom=120, left=140, right=140)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for r in p.runs:
            r.font.bold = True
            r.font.color.rgb = RGBColor(255, 255, 255)
            r.font.name = "Calibri"
            r.font.size = Pt(9.5)

    # Data rows
    for row_idx, row_data in enumerate(data):
        row_cells = table.rows[row_idx + 1].cells
        bg_color = "F9FAF8" if row_idx % 2 == 1 else "FFFFFF"
        is_subtotal = "Subtotal" in str(row_data[0]) or "TOTAL" in str(row_data[0])
        if is_subtotal:
            bg_color = "EAEFE9"

        for col_idx, cell_value in enumerate(row_data):
            cell = row_cells[col_idx]
            set_cell_background(cell, bg_color)
            set_cell_margins(cell, top=100, bottom=100, left=140, right=140)
            p = cell.paragraphs[0]
            
            # Check if cell_value has link info
            if isinstance(cell_value, dict) and "url" in cell_value:
                # Add clickable link with label
                add_hyperlink(p, cell_value["text"], cell_value["url"])
                # Also add plain text URL below for copy-pasting
                if "show_raw" in cell_value and cell_value["show_raw"]:
                    p_raw = p.add_run(f"\n{cell_value['url']}")
                    p_raw.font.name = "Calibri"
                    p_raw.font.size = Pt(7.5)
                    p_raw.font.color.rgb = RGBColor(100, 100, 100)
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            else:
                p.text = str(cell_value)
                if col_idx in [3, 4, 5, 6] or "KES" in str(cell_value) or "$" in str(cell_value):
                    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                else:
                    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                
                for r in p.runs:
                    r.font.name = "Calibri"
                    r.font.size = Pt(9)
                    if is_subtotal:
                        r.font.bold = True
                        r.font.color.rgb = RGBColor(27, 94, 32)
                    else:
                        r.font.color.rgb = RGBColor(40, 40, 40)

    # Set column widths
    if col_widths:
        for row in table.rows:
            for i, w in enumerate(col_widths):
                row.cells[i].width = Inches(w)

    doc.add_paragraph()  # Spacing
    return table

def build_docx(filename):
    doc = Document()

    # Page Margins (0.7 in)
    sections = doc.sections
    for section in sections:
        section.top_margin = Inches(0.7)
        section.bottom_margin = Inches(0.7)
        section.left_margin = Inches(0.7)
        section.right_margin = Inches(0.7)

    # Document Header
    p_pre = doc.add_paragraph()
    p_pre.paragraph_format.space_after = Pt(2)
    run_pre = p_pre.add_run("SHAMBA WATCH PROJECT SPECIFICATION")
    run_pre.font.name = "Calibri"
    run_pre.font.size = Pt(9)
    run_pre.font.bold = True
    run_pre.font.color.rgb = RGBColor(120, 140, 120)

    # Title
    p_title = doc.add_paragraph()
    p_title.paragraph_format.space_after = Pt(4)
    run_title = p_title.add_run("Bill of Materials (BOM) & Labor Estimate")
    run_title.font.name = "Calibri"
    run_title.font.size = Pt(22)
    run_title.font.bold = True
    run_title.font.color.rgb = RGBColor(27, 94, 32)

    # Subtitle
    p_sub = doc.add_paragraph()
    p_sub.paragraph_format.space_after = Pt(10)
    run_sub = p_sub.add_run("Turnkey Deployment of 6-Station Environmental & Agricultural Telemetry Network across the Agricultural Basin, Kenya\n"
                             "Naivasha · Ol Kalou · Nakuru Basin · Molo · Elementaita · Gilgil | Exchange Rate: 1 USD ≈ 130 KES")
    run_sub.font.name = "Calibri"
    run_sub.font.size = Pt(10)
    run_sub.font.italic = True
    run_sub.font.color.rgb = RGBColor(90, 90, 90)

    # Callout box on how to open links
    p_tip = doc.add_paragraph()
    p_tip.paragraph_format.space_after = Pt(14)
    run_tip_box = p_tip.add_run("💡 USER INSTRUCTION FOR HYPERLINKS IN MICROSOFT WORD:\n"
                                "• To open any link below in Microsoft Word: Hold the Ctrl key and click (Ctrl + Click).\n"
                                "• Alternatively, right-click any link and choose 'Open Hyperlink', or copy the displayed web address directly into your browser.")
    run_tip_box.font.name = "Calibri"
    run_tip_box.font.size = Pt(9)
    run_tip_box.font.bold = True
    run_tip_box.font.color.rgb = RGBColor(180, 100, 20)

    # Divider line
    p_div = doc.add_paragraph()
    p_div.paragraph_format.space_after = Pt(14)
    p_div_run = p_div.add_run("―" * 68)
    p_div_run.font.color.rgb = RGBColor(200, 215, 200)

    # Section 1: Project Scope
    h1 = doc.add_heading(level=1)
    h1_run = h1.add_run("1. Executive Summary & Deployment Architecture")
    h1_run.font.color.rgb = RGBColor(27, 94, 32)
    
    doc.add_paragraph(
        "Shamba Watch monitors hydrological, soil chemical, and microclimatic dynamics across 6 sentinel stations in the Kenyan "
        "agricultural basin. Each station operates autonomously off-grid, transmitting real-time telemetry over cellular LTE-M / NB-IoT to a cloud dashboard."
    )

    p_bullets = doc.add_paragraph()
    p_bullets.paragraph_format.left_indent = Inches(0.2)
    p_bullets.add_run("• Target Field Locations: ").bold = True
    p_bullets.add_run("Naivasha North Plot (Greenhouse), Ol Kalou (Maize), Nakuru Basin (Wetland), Molo (Tea), Elementaita (Rangeland), Gilgil (River Intake).\n")
    p_bullets.add_run("• Core Sensing Payload: ").bold = True
    p_bullets.add_run("Volumetric soil moisture (10–25cm), Soil NPK (25–40cm), water level transducer, ambient temperature/humidity, and thermal infrared sensor.\n")
    p_bullets.add_run("• Autonomous Power & Enclosure: ").bold = True
    p_bullets.add_run("50W Monocrystalline solar PV, 12V 17.5Ah Lithium battery pack, MPPT solar controller, and IP67 NEMA enclosure on a 3.5m anti-tamper mast.\n")
    p_bullets.add_run("• Sourcing Hubs: ").bold = True
    p_bullets.add_run("Nerokas Online Store (Nairobi) and authorized local distributors (Chloride Exide, Coast Cables, Lafarge/Bamburi Cement, Kirinyaga Road electrical suppliers).")

    # Section 2: Hardware BOM
    h2 = doc.add_heading(level=1)
    h2_run = h2.add_run("2. Hardware Bill of Materials (Priced in KES with Nairobi Links)")
    h2_run.font.color.rgb = RGBColor(27, 94, 32)

    # Table A: Sensors
    h2_a = doc.add_heading(level=2)
    h2_a_run = h2_a.add_run("A. Sensor Suite (6 Stations)")
    h2_a_run.font.color.rgb = RGBColor(40, 80, 50)

    sensor_headers = ["Item", "Component", "Specification", "Unit (KES)", "Qty", "Total (KES)", "Total (USD)", "Kenyan Store Source & Web Link"]
    sensor_widths = [0.45, 1.15, 1.5, 0.75, 0.35, 0.85, 0.75, 1.3]
    sensor_data = [
        ["A1", "Soil Moisture Probe", "Multi-depth FDR probe (0–40cm), RS-485 Modbus RTU", "15,000", "6", "90,000", "$692.31", 
         {"text": "Nerokas: 7-in-1 Sensor", "url": "https://store.nerokas.co.ke/SKU-3931", "show_raw": True}],
        ["A2", "Soil NPK Sensor", "Industrial optical/electrochemical probe (N, P, K), RS-485 Modbus", "15,000", "6", "90,000", "$692.31", 
         {"text": "Nerokas: 7-in-1 NPK", "url": "https://store.nerokas.co.ke/SKU-3931", "show_raw": True}],
        ["A3", "Water Level Transducer", "A02YYUW Waterproof Ultrasonic Sensor (IP67, UART/RS485)", "4,000", "6", "24,000", "$184.62", 
         {"text": "Nerokas: A02YYUW IP67", "url": "https://store.nerokas.co.ke/Sensors", "show_raw": True}],
        ["A4", "Ambient Temp & RH", "Sensirion SHT31 Outdoor Temp/Humidity probe with sintered metal mesh", "3,600", "6", "21,600", "$166.15", 
         {"text": "Nerokas: SHT31 Outdoor", "url": "https://store.nerokas.co.ke/SKU-3760", "show_raw": True}],
        ["A5", "Thermal IR Module", "AMG8833 8x8 IR Thermal Camera Breakout (Alt: MLX90614 @ KES 2,100)", "5,000", "6", "30,000", "$230.77", 
         {"text": "Nerokas: AMG8833 Thermal", "url": "https://store.nerokas.co.ke/SKU-3295", "show_raw": True}],
        ["Subtotal", "Sensor Suite Subtotal", "Unified 7-in-1 option saves KES 90,000 if A1 & A2 are combined", "-", "-", "KES 255,600", "$1,966.15", "Nerokas Online Store"]
    ]
    create_styled_table(doc, sensor_headers, sensor_data, sensor_widths)

    # Table B: Edge Node & Power
    h2_b = doc.add_heading(level=2)
    h2_b_run = h2_b.add_run("B. Edge Node, Solar Power & Enclosures (6 Stations)")
    h2_b_run.font.color.rgb = RGBColor(40, 80, 50)

    power_headers = ["Item", "Component", "Specification", "Unit (KES)", "Qty", "Total (KES)", "Total (USD)", "Kenyan Store Source & Web Link"]
    power_widths = [0.45, 1.15, 1.5, 0.75, 0.35, 0.85, 0.75, 1.3]
    power_data = [
        ["B1", "Cellular IoT Gateway", "LILYGO T-SIM7600 ESP32 LTE 4G Dev Board (Cat4, GPS, RS-485)", "14,000", "6", "84,000", "$646.15", 
         {"text": "Nerokas: Cellular IoT", "url": "https://store.nerokas.co.ke/", "show_raw": True}],
        ["B2", "Solar Power System", "50W Monocrystalline PV Panel + adjustable heavy-duty mast bracket", "4,500", "6", "27,000", "$207.69", 
         {"text": "Chloride Exide Kenya", "url": "https://chlorideexide.com/", "show_raw": True}],
        ["B3", "Battery Storage", "TERRAVOLT 12V 17.5Ah Lithium-ion Battery with integrated BMS", "15,000", "6", "90,000", "$692.31", 
         {"text": "Nerokas: Batteries", "url": "https://store.nerokas.co.ke/drones-robotics/Batteries", "show_raw": True}],
        ["B4", "Solar Charge Controller", "10A/20A MPPT Intelligent Solar Regulator (Solar Power Manager)", "2,000", "6", "12,000", "$92.31", 
         {"text": "Nerokas: Solar Manager", "url": "https://store.nerokas.co.ke/drones-robotics/Batteries", "show_raw": True}],
        ["B5", "Weatherproof Enclosure", "IP67 Hinged NEMA Polycarbonate Box with mounting plate (280x190mm)", "3,500", "6", "21,000", "$161.54", 
         {"text": "Nerokas: Enclosures", "url": "https://store.nerokas.co.ke/index.php?route=product/category&path=65", "show_raw": True}],
        ["B6", "Wiring, Glands & Jacks", "M12/M16 IP68 Cable Glands, 4-core shielded cable, aviation connectors", "2,500", "6", "15,000", "$115.38", 
         {"text": "Coast Cables Nairobi", "url": "https://www.coastcables.com/", "show_raw": True}],
        ["Subtotal", "Power & Gateway Subtotal", "Complete autonomous power & telemetry package", "-", "-", "KES 249,000", "$1,915.38", "Nerokas / Chloride Exide"]
    ]
    create_styled_table(doc, power_headers, power_data, power_widths)

    # Table C: Civil Works & Security
    h2_c = doc.add_heading(level=2)
    h2_c_run = h2_c.add_run("C. Civil Works, Mounting Masts & Physical Security (6 Stations)")
    h2_c_run.font.color.rgb = RGBColor(40, 80, 50)

    civil_headers = ["Item", "Component", "Specification", "Unit (KES)", "Qty", "Total (KES)", "Total (USD)", "Kenyan Store Source & Web Link"]
    civil_widths = [0.45, 1.15, 1.5, 0.75, 0.35, 0.85, 0.75, 1.3]
    civil_data = [
        ["C1", "Telescopic Sensor Mast", "3.5m Galvanized steel pole (Class B), baseplate, guy wires & turnbuckles", "9,500", "6", "57,000", "$438.46", 
         {"text": "Nairobi Metal Fabricators", "url": "https://store.nerokas.co.ke/", "show_raw": False}],
        ["C2", "Grounding & Surge Protection", "5ft Copper-bonded earth rod, clamp, 10m 16mm² wire, DC SPD arrester", "5,500", "6", "33,000", "$253.85", 
         {"text": "Coast Cables Nairobi", "url": "https://www.coastcables.com/", "show_raw": True}],
        ["C3", "Security Perimeter / Cage", "Steel anti-vandal lockbox for enclosure + 2mx2m razor wire / chain-link cage", "14,000", "6", "84,000", "$646.15", 
         {"text": "Local Metal Fabricators", "url": "https://store.nerokas.co.ke/", "show_raw": False}],
        ["C4", "Civil Consumables", "2 bags Bamburi/Simba cement, ballast, quarry sand, 20mm PVC conduit", "4,500", "6", "27,000", "$207.69", 
         {"text": "Bamburi Cement (Lafarge)", "url": "https://www.lafarge.co.ke/", "show_raw": True}],
        ["Subtotal", "Civil & Security Subtotal", "Anti-theft, wildlife mitigation & lightning grounding", "-", "-", "KES 201,000", "$1,546.15", "Nairobi Industrial Suppliers"]
    ]
    create_styled_table(doc, civil_headers, civil_data, civil_widths)

    # Section 3: Professional Labor
    h3 = doc.add_heading(level=1)
    h3_run = h3.add_run("3. Professional Labor & Engineering Services (Standardized at KES 1,700/hr)")
    h3_run.font.color.rgb = RGBColor(27, 94, 32)

    labor_headers = ["Workstream", "Roles & Responsibilities", "Hours", "Rate (KES/hr)", "Total (KES)", "Total (USD)"]
    labor_widths = [1.5, 2.7, 0.65, 0.75, 0.85, 0.75]
    labor_data = [
        ["Firmware & IoT Integration", "Hardware engineer: bench-testing, Modbus RS-485 calibration, low-power sleep modes, MQTT schemas", "48 hrs (6d)", "1,700", "81,600", "$627.69"],
        ["Backend & Cloud Pipeline", "Cloud architect: Firebase/GCP IoT pipeline, Firestore security rules, alert webhooks", "40 hrs (5d)", "1,700", "68,000", "$523.08"],
        ["Frontend UI/GIS Integration", "Frontend engineer: live Firebase connection, SVG sparklines, Leaflet layer calibration", "32 hrs (4d)", "1,700", "54,400", "$418.46"],
        ["Field Agronomy & Soil Baseline", "Lead Agronomist: soil core extraction, lab calibration, depth placement verification", "32 hrs (4d)", "1,700", "54,400", "$418.46"],
        ["Mechanical & Electrical Rigging", "Field crew (2 technicians x 6 days): mast erection, concrete footing, trenching, wiring", "96 hrs (12d)", "1,700", "163,200", "$1,255.38"],
        ["Commissioning & Quality Assurance", "QA engineer: end-to-end signal tests, satellite/IR feed alignment, network failover", "24 hrs (3d)", "1,700", "40,800", "$313.85"],
        ["Farmer & Operator Handover", "Extension officer: on-site training for farm managers & coops (Naivasha, Molo, Ol Kalou)", "16 hrs (2d)", "1,700", "27,200", "$209.23"],
        ["Subtotal", "Professional Engineering & Field Services (288 Hours Total)", "288 hrs", "-", "KES 489,600", "$3,766.15"]
    ]
    create_styled_table(doc, labor_headers, labor_data, labor_widths)

    # Section 4: Logistics & OpEx
    h4 = doc.add_heading(level=1)
    h4_run = h4.add_run("4. Field Logistics & Circuit Travel")
    h4_run.font.color.rgb = RGBColor(27, 94, 32)

    log_headers = ["Item", "Description / Details", "Unit Cost", "Qty", "Total (KES)", "Total (USD)"]
    log_widths = [1.5, 2.7, 0.75, 0.65, 0.85, 0.75]
    log_data = [
        ["Vehicle Hire & Fuel", "4WD vehicle across Nairobi – Naivasha – Nakuru – Molo – Ol Kalou circuit", "$120/day", "7 days", "109,200", "$840.00"],
        ["Field Per Diem & Stays", "3-person deployment team field allowances in Agricultural Basin", "$150/day", "6 days", "117,000", "$900.00"],
        ["Permits & Wayleaves", "County permissions & Water Resources Authority (WARMA) coordination", "Lump sum", "1", "45,500", "$350.00"],
        ["Subtotal", "Logistics, Field Travel & Regional Permits", "-", "-", "KES 271,700", "$2,090.00"]
    ]
    create_styled_table(doc, log_headers, log_data, log_widths)

    # Section 5: OpEx
    h5 = doc.add_heading(level=1)
    h5_run = h5.add_run("5. Annual Operational Expenditure (Year 1 OpEx)")
    h5_run.font.color.rgb = RGBColor(27, 94, 32)

    opex_headers = ["Item", "Service Details", "Monthly (KES)", "Annual (KES)", "Annual (USD)", "Provider & Web Link"]
    opex_widths = [1.5, 2.5, 0.85, 0.85, 0.75, 1.2]
    opex_data = [
        ["Cellular IoT Data (eSIM)", "6x Safaricom / Airtel IoT M2M SIMs (500MB data pool + SMS alerts)", "3,900", "46,800", "$360.00", 
         {"text": "Safaricom Kenya", "url": "https://www.safaricom.co.ke/", "show_raw": True}],
        ["Cloud Hosting & Database", "Firestore reads/writes, Firebase Hosting, Cloud Functions, Alert Webhooks", "3,250", "39,000", "$300.00", 
         {"text": "Google Firebase", "url": "https://firebase.google.com/", "show_raw": True}],
        ["Quarterly Maintenance", "Solar panel cleaning, sensor probe descaling, battery load test (4 visits/yr)", "8,667", "104,000", "$800.00", "Local Field Crew"],
        ["Spare Parts Buffer", "Sacrificial sensor cables, replacement fuses, 10% probe contingency", "5,417", "65,000", "$500.00", "Nerokas / Local"],
        ["Total OpEx", "Annual Operating Costs for 6-Station Telemetry Network", "KES 21,234/mo", "KES 254,800", "$1,960.00", "Year 1 Total"]
    ]
    create_styled_table(doc, opex_headers, opex_data, opex_widths)

    # Section 6: Financial Summary
    h6 = doc.add_heading(level=1)
    h6_run = h6.add_run("6. Comprehensive Financial Summary (CapEx vs. OpEx)")
    h6_run.font.color.rgb = RGBColor(27, 94, 32)

    sum_headers = ["Category", "Scope Description", "Total (KES)", "Total (USD)", "% of CapEx"]
    sum_widths = [1.6, 2.6, 1.1, 0.9, 0.8]
    sum_data = [
        ["1. Sensor Hardware", "6 stations x 5 sensor categories (NPK, Moisture, Level, Temp/RH, IR)", "255,600", "$1,966.15", "16.4%"],
        ["2. Power & Edge Gateways", "6 stations x Solar panels, MPPT controllers, Li-ion batteries, LTE-M boards", "249,000", "$1,915.38", "15.9%"],
        ["3. Civil Works & Security", "6 stations x 3.5m masts, earth grounding, anti-theft cages, concrete footings", "201,000", "$1,546.15", "12.9%"],
        ["4. Engineering & Field Labor", "288 billable hours across firmware, cloud, UI, agronomy, installation @ KES 1,700/hr", "489,600", "$3,766.15", "31.3%"],
        ["5. Logistics & Travel", "7-day 4WD vehicle hire, technician per diems across Agricultural Basin, WARMA permits", "271,700", "$2,090.00", "17.4%"],
        ["Contingency Buffer (8%)", "Unforeseen site modifications, spare cables, hardware replacement reserve", "95,616", "$735.51", "6.1%"],
        ["TOTAL PROJECT CAPEX", "Turnkey Procurement, Engineering, Deployment & Handover", "KES 1,561,916", "$12,014.74", "100.0%"],
        ["ANNUAL OPEX (YEAR 1)", "Cellular IoT SIMs, Cloud Hosting, Quarterly Field Maintenance & Spares", "KES 254,800", "$1,960.00/yr", "-"]
    ]
    create_styled_table(doc, sum_headers, sum_data, sum_widths)

    # Section 7: Strategic Recommendations
    h7 = doc.add_heading(level=1)
    h7_run = h7.add_run("7. Cost Optimization & Implementation Strategy")
    h7_run.font.color.rgb = RGBColor(27, 94, 32)

    p_opt = doc.add_paragraph()
    p_opt.paragraph_format.left_indent = Inches(0.2)
    p_opt.add_run("1. Unified 7-in-1 Probe Optimization: ").bold = True
    p_opt.add_run("By purchasing the 7-in-1 Soil Sensor from Nerokas (KES 15,000) that integrates Moisture, N, P, K, Temp, EC, and pH into one probe, "
                  "separate spending for items A1 and A2 is avoided. This directly saves KES 90,000 ($692.31), lowering overall CapEx to KES 1,464,716 ($11,267.05).\n\n")
    p_opt.add_run("2. Phased Deployment Circuit: ").bold = True
    p_opt.add_run("Deploy two anchor stations first — ST-01 (Naivasha Greenhouse) and ST-06 (Gilgil River Intake) — to validate hydrological and soil telemetry "
                  "over the local Safaricom IoT cellular network before erecting masts at the remaining 4 remote plots.\n\n")
    p_opt.add_run("3. Anti-Theft & Lightning Mitigation: ").bold = True
    p_opt.add_run("Given the open rangeland conditions in Elementaita and Molo highlands, the anti-vandal lockable cage and 16mm² copper grounding rod are mandatory "
                  "safeguards to prevent equipment theft and thunderstorm surge damage.")

    # Save document
    doc.save(filename)
    print(f"Successfully generated: {filename}")

if __name__ == "__main__":
    output_path = os.path.abspath("Shamba_Watch_BOM_and_Labor_Estimate.docx")
    build_docx(output_path)
