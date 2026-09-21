import json
import os
import sys
import re
from datetime import datetime
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE

def clean_val(val):
    if val is None:
        return ""
    if isinstance(val, str):
        return ILLEGAL_CHARACTERS_RE.sub('', val)
    return val

# إعداد المسارات
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'server', 'data', 'generated')
OUTPUT_DIR = os.path.join(BASE_DIR, 'XLSX')
os.makedirs(OUTPUT_DIR, exist_ok=True)

REPORTS_FILE = os.path.join(DATA_DIR, 'reports.json')
PROJECTS_FILE = os.path.join(DATA_DIR, 'projects.json')
MANAGERS_FILE = os.path.join(DATA_DIR, 'managers.json')
STATS_FILE = os.path.join(DATA_DIR, 'stats.json')

# ألوان الهوية التنفيذية لشركة المياه الوطنية (NWC Palette)
C_PRIMARY_NAVY = '0A2540'     # كحلي داكن رسمي
C_ROYAL_BLUE   = '1E40AF'     # أزرق ملكي
C_HEADER_FILL  = '0F3B66'     # كحلي الترويسات
C_SUB_HEADER   = '1D4E89'     # أزرق وسيط
C_ACCENT_BLUE  = 'E0F2FE'     # سماوي فاتح جداً
C_WHITE        = 'FFFFFF'
C_DARK_TEXT    = '1E293B'     # رمادي داكن ناصع
C_ZEBRA        = 'F8FAFC'     # رمادي خفيف لتبادل الأسطر
C_CARD_BG      = 'F1F5F9'     # خلفية البطاقات
C_BORDER_LIGHT = 'CBD5E1'     # حدود الخلايا

# ألوان شرائح العمر والحوكمة
COLORS_AGING = {
    '0 - 30':   {'fill': 'DCFCE7', 'text': '166534', 'label': '0 - 30 يوم (طبيعي 🟢)', 'risk': 'منخفض'},
    '31 - 60':  {'fill': 'FEF9C3', 'text': '854D0E', 'label': '31 - 60 يوم (قيد المتابعة 🟡)', 'risk': 'متوسط'},
    '61 - 90':  {'fill': 'FFEDD5', 'text': '9A3412', 'label': '61 - 90 يوم (متأخر عن SLA 🟠)', 'risk': 'مرتفع'},
    '91 - 180': {'fill': 'FEE2E2', 'text': '991B1B', 'label': '91 - 180 يوم (حرج وتشغيلي 🔴)', 'risk': 'حرج'},
    '> 180':    {'fill': 'FCE7F3', 'text': '831843', 'label': 'أكثر من 180 يوم (خرق جسيم 🚨)', 'risk': 'خرق جسيم'}
}

# ألوان حالات البلاغات
COLORS_STATUS = {
    'تحت معالجة المقاول':           {'fill': 'E0E7FF', 'text': '3730A3'},
    'معاد من المقاول':              {'fill': 'FEE2E2', 'text': '991B1B'},
    'معاد من الجهة المتعدية':       {'fill': 'FEF3C7', 'text': '92400E'},
    'معاد للجهة المالكة':           {'fill': 'F1F5F9', 'text': '475569'},
    'بانتظار اعتماد الجهة المتعدية': {'fill': 'E0F2FE', 'text': '075985'},
    'تحت معالجة الجهة المتعدية':     {'fill': 'ECFDF5', 'text': '065F46'},
    'تمت المعالجة':                 {'fill': 'DCFCE7', 'text': '166534'}
}

def get_aging_info(age_days):
    if age_days is None or age_days < 0:
        return COLORS_AGING['0 - 30']
    if age_days <= 30:
        return COLORS_AGING['0 - 30']
    elif age_days <= 60:
        return COLORS_AGING['31 - 60']
    elif age_days <= 90:
        return COLORS_AGING['61 - 90']
    elif age_days <= 180:
        return COLORS_AGING['91 - 180']
    else:
        return COLORS_AGING['> 180']

def get_routing_reason_text(report):
    reason = report.get('reason', '')
    if 'spatial:kml' in reason:
        return 'تطابق مكاني مع مضلع المشروع الجاري في طبقات KMZ المعتمدة'
    elif 'aswad_exception' in reason:
        return 'استثناء معتمد لمشاريع م. عبدالله الأسود (تغطية شاملة لمدينة الرياض)'
    elif 'governorate' in reason:
        return 'مشروع محافظات: تطابق مقاول المشروع الجاري ونطاق المحافظة'
    elif 'proj_ref' in reason:
        return 'تطابق المقاول والنطاق مع ذكر صريح لبيانات المشروع في نص البلاغ'
    elif 'contractor+district' in reason:
        return 'تطابق مقاول المشروع ونطاق الحي الجغرافي المعتمد'
    elif 'manual' in reason:
        return 'إسناد واعتماد يدوي من إدارة المشاريع'
    elif report.get('matched'):
        return 'مطابقة معتمدة مع مشروع جاري'
    else:
        return 'خارج نطاق المشاريع الجارية (تشغيل وصيانة / شبكة قائمة)'

def get_recommended_action(report):
    status = report.get('status', '')
    age_days = report.get('ageDays', 0)
    contractor = report.get('project', {}).get('contractor', report.get('contractorName', 'المقاول'))

    if age_days > 180:
        return f'إنذار نهائي عاجل لـ ({contractor}) وتطبيق غرامات التأخير وحسم تكاليف الإصلاح فوراً'
    elif status == 'معاد من المقاول':
        return f'مراجعة مبررات الإعادة مع ({contractor}) وإلزامه بالتنسيق الفوري مع الجهة المتضررة'
    elif status == 'تحت معالجة المقاول':
        return f'إلزام ({contractor}) بإنهاء الأعمال وإرفاق محضر إنهاء الملاحظات وتحديث النظام'
    elif status in ['معاد من الجهة المتعدية', 'معاد للجهة المالكة']:
        return f'مخاطبة الجهة المتعدية رسمياً وإلزام مقاول المشروع بالمتابعة الميدانية'
    elif status == 'بانتظار اعتماد الجهة المتعدية':
        return 'متابعة اعتماد إغلاق البلاغ لدى الجهة المتعدية لرفع نسبة الإنجاز'
    elif status == 'تمت المعالجة':
        return 'تم إغلاق البلاغ بنجاح ومعالجة الموقع'
    else:
        return f'متابعة الإجراء الميداني الفوري مع ({contractor})'

def thin_border():
    thin = Side(border_style="thin", color=C_BORDER_LIGHT)
    return Border(top=thin, left=thin, right=thin, bottom=thin)

def double_bottom_border():
    thin = Side(border_style="thin", color=C_BORDER_LIGHT)
    double = Side(border_style="double", color=C_HEADER_FILL)
    return Border(top=thin, left=thin, right=thin, bottom=double)

def card_border():
    medium = Side(border_style="medium", color=C_SUB_HEADER)
    return Border(top=medium, left=medium, right=medium, bottom=medium)

def auto_fit_columns(ws, max_cols=30, max_width_limit=55):
    for col in range(1, max_cols + 1):
        col_letter = get_column_letter(col)
        max_len = 0
        for row in range(1, ws.max_row + 1):
            cell = ws.cell(row=row, column=col)
            val = cell.value
            if val is not None:
                val_str = str(val)
                lines = val_str.split('\n')
                longest_line = max(len(l) for l in lines)
                if longest_line > max_len:
                    max_len = longest_line
        
        width = max(max_len + 3, 12)
        if width > max_width_limit:
            width = max_width_limit
        ws.column_dimensions[col_letter].width = width

def setup_sheet_view(ws):
    ws.views.sheetView[0].rightToLeft = True
    ws.views.sheetView[0].showGridLines = True

def write_reports_table(ws, reports_list, sheet_title_text, subtitle_text):
    setup_sheet_view(ws)

    # عنوان الورقة
    ws.merge_cells("A1:Z1")
    ws.row_dimensions[1].height = 36
    h_rep = ws["A1"]
    h_rep.value = sheet_title_text
    h_rep.font = Font(name="Segoe UI", size=14, bold=True, color=C_WHITE)
    h_rep.alignment = Alignment(horizontal="center", vertical="center")
    h_rep.fill = PatternFill(start_color=C_PRIMARY_NAVY, end_color=C_PRIMARY_NAVY, fill_type="solid")

    ws.merge_cells("A2:Z2")
    ws.row_dimensions[2].height = 22
    h_sub = ws["A2"]
    h_sub.value = subtitle_text
    h_sub.font = Font(name="Segoe UI", size=9, bold=True, color="E2E8F0")
    h_sub.alignment = Alignment(horizontal="center", vertical="center")
    h_sub.fill = PatternFill(start_color=C_HEADER_FILL, end_color=C_HEADER_FILL, fill_type="solid")

    headers_reports = [
        "م",
        "رقم بلاغ التعدي",
        "مدير البرنامج المسؤول (NWC)",
        "اسم المشروع الجاري",
        "رقم العملية",
        "أمر الشراء (PO)",
        "مقاول المشروع المعتمد",
        "الاستشاري المشرف",
        "القطاع والشبكة",
        "المدينة / المحافظة",
        "الحي",
        "الشارع / الموقع",
        "خط الطول (X)",
        "خط العرض (Y)",
        "تاريخ البلاغ",
        "عمر البلاغ (يوم)",
        "مستوى الخطورة وشريحة العمر",
        "حالة البلاغ في المنظومة",
        "جهة التوجيه المعتمدة",
        "سبب المطابقة والتوجيه",
        "الجهة المالكة للمرفق",
        "الجهة المتعدية المسجلة",
        "وصف التعدي الميداني",
        "أثر التعدي وضرر المرفق",
        "تعليق المركز وسجل التوجيه",
        "الإجراء التنفيذي المطلوب"
    ]

    ws.row_dimensions[4].height = 30
    for col_i, h in enumerate(headers_reports, start=1):
        cell = ws.cell(row=4, column=col_i, value=h)
        cell.font = Font(name="Segoe UI", size=9, bold=True, color=C_WHITE)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.fill = PatternFill(start_color=C_SUB_HEADER, end_color=C_SUB_HEADER, fill_type="solid")
        cell.border = thin_border()

    for r_idx, rep in enumerate(reports_list, start=1):
        row_num = r_idx + 4
        ws.row_dimensions[row_num].height = 24

        age_days = rep.get('ageDays', 0)
        aging_info = get_aging_info(age_days)
        routing_reason = get_routing_reason_text(rep)
        rec_action = get_recommended_action(rep)
        proj = rep.get('project', {})
        status = rep.get('status', 'تحت معالجة المقاول')

        row_data = [
            r_idx,
            rep.get('id', ''),
            proj.get('programManager', 'غير محدد'),
            proj.get('name', 'غير محدد'),
            proj.get('operationNumber', '-'),
            proj.get('po', '-'),
            proj.get('contractor', rep.get('contractorName', '-')),
            proj.get('consultant', '-'),
            rep.get('sector', 'صرف'),
            rep.get('city', 'الرياض'),
            rep.get('district', '-'),
            rep.get('street', '-'),
            rep.get('longitude', '-'),
            rep.get('latitude', '-'),
            rep.get('dateReport', rep.get('dateIncident', '-')),
            age_days,
            aging_info['label'],
            status,
            f"المقاول ({proj.get('contractor', rep.get('contractorName', ''))}) - مشروع جاري",
            routing_reason,
            rep.get('ownerEntity', '-'),
            rep.get('encroachingEntity', '-'),
            rep.get('description', '-'),
            rep.get('impact', '-'),
            rep.get('centerComment', '-'),
            rec_action
        ]

        is_even = (r_idx % 2 == 0)
        row_bg = C_ZEBRA if is_even else C_WHITE

        for col_i, val in enumerate(row_data, start=1):
            cell = ws.cell(row=row_num, column=col_i, value=clean_val(val))
            cell.font = Font(name="Segoe UI", size=9, color=C_DARK_TEXT)
            cell.border = thin_border()

            if col_i in [1, 2, 5, 6, 9, 13, 14, 15, 16]:
                cell.alignment = Alignment(horizontal="center", vertical="center")
            else:
                cell.alignment = Alignment(horizontal="right", vertical="center")

            cell.fill = PatternFill(start_color=row_bg, end_color=row_bg, fill_type="solid")

            if col_i == 2:
                cell.font = Font(name="Segoe UI", size=9, bold=True, color=C_ROYAL_BLUE)
            elif col_i == 3:
                cell.font = Font(name="Segoe UI", size=9, bold=True, color=C_PRIMARY_NAVY)
            elif col_i == 16:
                cell.font = Font(name="Segoe UI", size=9, bold=True)
            elif col_i == 17:
                cell.fill = PatternFill(start_color=aging_info['fill'], end_color=aging_info['fill'], fill_type="solid")
                cell.font = Font(name="Segoe UI", size=9, bold=True, color=aging_info['text'])
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif col_i == 18:
                st_color = COLORS_STATUS.get(status, {'fill': 'F1F5F9', 'text': '334155'})
                cell.fill = PatternFill(start_color=st_color['fill'], end_color=st_color['fill'], fill_type="solid")
                cell.font = Font(name="Segoe UI", size=8, bold=True, color=st_color['text'])
                cell.alignment = Alignment(horizontal="center", vertical="center")
            elif col_i == 26:
                cell.font = Font(name="Segoe UI", size=8.5, bold=True, color='831843' if age_days > 180 else '0F3B66')

    ws.freeze_panes = "A5"
    ws.auto_filter.ref = f"A4:Z{len(reports_list) + 4}"
    auto_fit_columns(ws, max_cols=26, max_width_limit=45)
    ws.column_dimensions['A'].width = 5
    ws.column_dimensions['B'].width = 14
    ws.column_dimensions['C'].width = 22
    ws.column_dimensions['D'].width = 38
    ws.column_dimensions['G'].width = 28
    ws.column_dimensions['Q'].width = 26
    ws.column_dimensions['R'].width = 22
    ws.column_dimensions['T'].width = 36
    ws.column_dimensions['W'].width = 40
    ws.column_dimensions['X'].width = 35
    ws.column_dimensions['Y'].width = 40
    ws.column_dimensions['Z'].width = 42

def main():
    print("🚀 بدء إنشاء التقرير التنفيذي الشامل للبلاغات (Excel)...")

    # تحميل البيانات
    with open(REPORTS_FILE, 'r', encoding='utf-8') as f:
        all_reports = json.load(f)
    with open(PROJECTS_FILE, 'r', encoding='utf-8') as f:
        all_projects = json.load(f)
    with open(MANAGERS_FILE, 'r', encoding='utf-8') as f:
        managers_data = json.load(f)
    with open(STATS_FILE, 'r', encoding='utf-8') as f:
        stats_data = json.load(f)

    # 1. تصفية البلاغات المعلقة المعتمدة للمشاريع الجارية (تحت معالجة المقاول فقط)
    pending_assigned = [r for r in all_reports if r.get('matched') and r.get('project') and not r.get('excluded') and r.get('status') == 'تحت معالجة المقاول']
    pending_assigned.sort(key=lambda r: (r['project'].get('programManager', ''), -(r.get('ageDays') or 0)))

    # 2. بلاغات تحت الإجراء للمشاريع الجارية (لا تنطبق عليها تحت معالجة المقاول وليست تمت المعالجة)
    in_progress_assigned = [r for r in all_reports if r.get('matched') and r.get('project') and not r.get('excluded') and r.get('status') != 'تحت معالجة المقاول' and r.get('status') != 'تمت المعالجة']
    in_progress_assigned.sort(key=lambda r: (r['project'].get('programManager', ''), -(r.get('ageDays') or 0)))

    # 3. بلاغات تمت معالجتها للمشاريع الجارية
    processed_assigned = [r for r in all_reports if r.get('matched') and r.get('project') and not r.get('excluded') and r.get('status') == 'تمت المعالجة']

    # 4. إجمالي البلاغات النشطة للمشاريع الجارية
    active_assigned = pending_assigned + in_progress_assigned

    # 5. كافة البلاغات المعلقة في المنظومة (تحت معالجة المقاول فقط)
    all_pending = [r for r in all_reports if r.get('status') == 'تحت معالجة المقاول']
    all_pending.sort(key=lambda r: -(r.get('ageDays') or 0))

    print(f"✓ تم حصر {len(pending_assigned)} بلاغ معلق (تحت معالجة المقاول) للمشاريع الجارية.")
    print(f"✓ تم حصر {len(in_progress_assigned)} بلاغ تحت الإجراء للمشاريع الجارية.")
    print(f"✓ تم حصر {len(processed_assigned)} بلاغ تمت معالجته للمشاريع الجارية.")
    print(f"✓ تم حصر {len(all_pending)} بلاغ معلق إجمالي في كافة مسارات الشركة.")

    # إنشاء مصنف Excel جديد
    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    # -------------------------------------------------------------
    # 1. ورقة العمل الأولى: 📊 الملخص التنفيذي ومؤشرات الأداء
    # -------------------------------------------------------------
    ws_kpi = wb.create_sheet(title="المؤشرات التنفيذية")
    setup_sheet_view(ws_kpi)

    # عنوان التقرير
    ws_kpi.merge_cells("B2:O2")
    ws_kpi.row_dimensions[2].height = 42
    title_cell = ws_kpi["B2"]
    title_cell.value = "شركة المياه الوطنية • قطاع المشاريع الراسمالية بالقطاع الأوسط | التقرير التنفيذي لحوكمة بلاغات التعديات"
    title_cell.font = Font(name="Segoe UI", size=15, bold=True, color=C_WHITE)
    title_cell.alignment = Alignment(horizontal="center", vertical="center")
    title_cell.fill = PatternFill(start_color=C_PRIMARY_NAVY, end_color=C_PRIMARY_NAVY, fill_type="solid")

    # سطر الميتا والبيانات الإدارية
    ws_kpi.merge_cells("B3:O3")
    ws_kpi.row_dimensions[3].height = 24
    sub_cell = ws_kpi["B3"]
    sub_cell.value = f"تاريخ الاستخراج: 19 سبتمبر 2026 | النطاق: مشاريع البنية التحتية الجارية | معلقة (تحت المقاول): {len(pending_assigned)} | تحت الإجراء: {len(in_progress_assigned)} | تمت المعالجة: {len(processed_assigned)}"
    sub_cell.font = Font(name="Segoe UI", size=10, bold=True, color="E2E8F0")
    sub_cell.alignment = Alignment(horizontal="center", vertical="center")
    sub_cell.fill = PatternFill(start_color=C_HEADER_FILL, end_color=C_HEADER_FILL, fill_type="solid")

    # بطاقات المؤشرات الرقمية (KPI Cards) - 6 بطاقات
    kpis = [
        ("معلقة (تحت المقاول)", f"{len(pending_assigned)} بلاغاً", C_ROYAL_BLUE, "تحت معالجة المقاول ⏳"),
        ("تحت الإجراء", f"{len(in_progress_assigned)} بلاغاً", "D97706", "متابعات واعتماد 🔄"),
        ("تمت المعالجة", f"{len(processed_assigned)} بلاغاً", "166534", "إغلاق معتمد بالمشاريع ✅"),
        ("خرق جسيم (>180 يوم)", f"{sum(1 for r in active_assigned if (r.get('ageDays') or 0) > 180)} بلاغاً", "831843", "أولوية قصوى 🚨"),
        ("حرج وتشغيلي (91-180)", f"{sum(1 for r in active_assigned if 90 < (r.get('ageDays') or 0) <= 180)} بلاغاً", "991B1B", "تجاوز SLA 🔴"),
        ("متوسط مدة التأخير", f"{stats_data.get('avgDelay', 155)} يوماً", C_HEADER_FILL, f"الأعلى: {stats_data.get('maxDelay', 654)} يوم")
    ]

    card_cols = [("B", "C"), ("D", "E"), ("F", "G"), ("H", "I"), ("J", "K"), ("L", "M")]
    ws_kpi.row_dimensions[5].height = 20
    ws_kpi.row_dimensions[6].height = 36
    ws_kpi.row_dimensions[7].height = 20

    for idx, (label, val, col_color, note) in enumerate(kpis):
        c_start, c_end = card_cols[idx]
        
        ws_kpi.merge_cells(f"{c_start}5:{c_end}5")
        top = ws_kpi[f"{c_start}5"]
        top.value = label
        top.font = Font(name="Segoe UI", size=9, bold=True, color="64748B")
        top.alignment = Alignment(horizontal="center", vertical="center")
        top.fill = PatternFill(start_color=C_CARD_BG, end_color=C_CARD_BG, fill_type="solid")
        
        ws_kpi.merge_cells(f"{c_start}6:{c_end}6")
        mid = ws_kpi[f"{c_start}6"]
        mid.value = val
        mid.font = Font(name="Segoe UI", size=15, bold=True, color=col_color)
        mid.alignment = Alignment(horizontal="center", vertical="center")
        mid.fill = PatternFill(start_color=C_CARD_BG, end_color=C_CARD_BG, fill_type="solid")

        ws_kpi.merge_cells(f"{c_start}7:{c_end}7")
        bot = ws_kpi[f"{c_start}7"]
        bot.value = note
        bot.font = Font(name="Segoe UI", size=8, bold=True, color="475569")
        bot.alignment = Alignment(horizontal="center", vertical="center")
        bot.fill = PatternFill(start_color=C_CARD_BG, end_color=C_CARD_BG, fill_type="solid")

        for r in range(5, 8):
            for c in [c_start, c_end]:
                ws_kpi[f"{c}{r}"].border = thin_border()

    # جدول 1: موقف مدراء البرامج المعتمدين (10 مدراء)
    ws_kpi.merge_cells("B9:O9")
    ws_kpi.row_dimensions[9].height = 28
    sec1 = ws_kpi["B9"]
    sec1.value = "📌 جدول تفصيلي: موقف مدراء البرامج ومعدلات التأخير للبلاغات المعلقة وتحت الإجراء والمعالجة"
    sec1.font = Font(name="Segoe UI", size=11, bold=True, color=C_WHITE)
    sec1.alignment = Alignment(horizontal="right", vertical="center")
    sec1.fill = PatternFill(start_color=C_SUB_HEADER, end_color=C_SUB_HEADER, fill_type="solid")

    headers_mgr = [
        "م", "مدير البرنامج المسؤول", "القطاع والنطاق التشغيلي", 
        "معلقة (تحت المقاول)", "تحت الإجراء 🔄", "تمت المعالجة ✅", "إجمالي النشط",
        "0-30 يوم 🟢", "31-60 يوم 🟡", "61-90 يوم 🟠", "91-180 يوم 🔴", ">180 يوم 🚨",
        "متوسط التأخير", "جوال التواصل", "البريد الإلكتروني"
    ]
    ws_kpi.row_dimensions[10].height = 28
    for col_i, h in enumerate(headers_mgr, start=2):
        cell = ws_kpi.cell(row=10, column=col_i, value=h)
        cell.font = Font(name="Segoe UI", size=9, bold=True, color=C_WHITE)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.fill = PatternFill(start_color=C_PRIMARY_NAVY, end_color=C_PRIMARY_NAVY, fill_type="solid")
        cell.border = thin_border()

    # ملء بيانات مدراء البرامج
    curr_row = 11
    mgr_stats_map = {}
    assigned_all = [r for r in all_reports if r.get('matched') and r.get('project') and not r.get('excluded')]

    for r in assigned_all:
        m_name = r['project'].get('programManager', 'غير محدد')
        if m_name not in mgr_stats_map:
            mgr_stats_map[m_name] = {
                'pending': 0, 'in_prog': 0, 'proc': 0, 'active': 0,
                'b0_30': 0, 'b31_60': 0, 'b61_90': 0, 'b91_180': 0, 'b_gt180': 0, 
                'ages': []
            }
        st = mgr_stats_map[m_name]
        status = r.get('status')
        age = r.get('ageDays', 0)

        if status == 'تحت معالجة المقاول':
            st['pending'] += 1
            st['active'] += 1
            st['ages'].append(age)
            if age <= 30: st['b0_30'] += 1
            elif age <= 60: st['b31_60'] += 1
            elif age <= 90: st['b61_90'] += 1
            elif age <= 180: st['b91_180'] += 1
            else: st['b_gt180'] += 1
        elif status == 'تمت المعالجة':
            st['proc'] += 1
        else:
            st['in_prog'] += 1
            st['active'] += 1
            st['ages'].append(age)
            if age <= 30: st['b0_30'] += 1
            elif age <= 60: st['b31_60'] += 1
            elif age <= 90: st['b61_90'] += 1
            elif age <= 180: st['b91_180'] += 1
            else: st['b_gt180'] += 1

    all_ten_managers = [
        {"name": "أمجد الفالح", "scope": "غرب الرياض - صرف", "phone": "555390254", "email": "aalfaleh@nwc.com.sa"},
        {"name": "عبدالله الأسود العنزي", "scope": "مشاريع متفرقة - كامل مدينة الرياض", "phone": "509997997", "email": "amalenazi@nwc.com.sa"},
        {"name": "عسكر لسلوم", "scope": "شمال الرياض - صرف", "phone": "567448829", "email": "llslum@nwc.com.sa"},
        {"name": "تركي ظافر يحيى الاسمري", "scope": "جنوب الرياض - صرف", "phone": "582877792", "email": "tdalasmri@nwc.com.sa"},
        {"name": "عبدالله علي العنزي", "scope": "غرب الرياض - مياه", "phone": "555197474", "email": "aaenazi@nwc.com.sa"},
        {"name": "سعيد الحارث", "scope": "المحافظات الغربية - مياه وصرف", "phone": "598991815", "email": "salharth@nwc.com.sa"},
        {"name": "سفر العتيبي", "scope": "شمال الرياض - مياه", "phone": "503419469", "email": "sfrnalotaibi@nwc.com.sa"},
        {"name": "فهد العنزي", "scope": "مياه - شرق الرياض", "phone": "555278400", "email": "fhalenazi@nwc.com.sa"},
        {"name": "علي الشهري", "scope": "جنوب الرياض - مياه", "phone": "564499977", "email": "alalshehri.c@nwc.com.sa"},
        {"name": "علي القحطاني", "scope": "المحافظات الشمالية - مياه وصرف", "phone": "555299813", "email": "aaalqahtani@nwc.com.sa"},
        {"name": "شاكر الحقباني", "scope": "المحافظات الجنوبية - مياه وصرف", "phone": "555022025", "email": "talnoufal@nwc.com.sa"}
    ]
    sorted_ten_managers = sorted(
        all_ten_managers,
        key=lambda m: (
            -mgr_stats_map.get(m['name'], {}).get('pending', 0),
            -mgr_stats_map.get(m['name'], {}).get('active', 0),
            m['name']
        )
    )

    for idx, mgr in enumerate(sorted_ten_managers, start=1):
        ws_kpi.row_dimensions[curr_row].height = 22
        st = mgr_stats_map.get(mgr['name'], {
            'pending': 0, 'in_prog': 0, 'proc': 0, 'active': 0,
            'b0_30': 0, 'b31_60': 0, 'b61_90': 0, 'b91_180': 0, 'b_gt180': 0, 'ages': []
        })
        avg_delay = round(sum(st['ages'])/len(st['ages'])) if st['ages'] else 0

        row_vals = [
            idx,
            mgr['name'],
            mgr['scope'],
            st['pending'],
            st['in_prog'],
            st['proc'],
            st['active'],
            st['b0_30'],
            st['b31_60'],
            st['b61_90'],
            st['b91_180'],
            st['b_gt180'],
            f"{avg_delay} يوم" if avg_delay > 0 else "-",
            mgr['phone'],
            mgr['email']
        ]

        is_even = (idx % 2 == 0)
        row_bg = C_ZEBRA if is_even else C_WHITE

        for col_i, v in enumerate(row_vals, start=2):
            c = ws_kpi.cell(row=curr_row, column=col_i, value=v)
            c.font = Font(name="Segoe UI", size=9, bold=(col_i in [3, 5, 8]), color=C_DARK_TEXT)
            c.alignment = Alignment(horizontal="center" if col_i not in [3, 4] else "right", vertical="center")
            c.fill = PatternFill(start_color=row_bg, end_color=row_bg, fill_type="solid")
            c.border = thin_border()

            if col_i == 5 and st['pending'] > 0:
                c.font = Font(name="Segoe UI", size=9.5, bold=True, color=C_ROYAL_BLUE)
            elif col_i == 6 and st['in_prog'] > 0:
                c.font = Font(name="Segoe UI", size=9.5, bold=True, color='D97706')
            elif col_i == 7 and st['proc'] > 0:
                c.font = Font(name="Segoe UI", size=9, bold=True, color='166534')
            elif col_i == 8:
                c.font = Font(name="Segoe UI", size=9.5, bold=True, color=C_PRIMARY_NAVY)
            elif col_i == 13 and st['b_gt180'] > 0:
                c.fill = PatternFill(start_color='FCE7F3', end_color='FCE7F3', fill_type="solid")
                c.font = Font(name="Segoe UI", size=9, bold=True, color='831843')

        curr_row += 1

    # صف الإجمالي
    ws_kpi.row_dimensions[curr_row].height = 24
    total_cells = [
        "الإجمالي", "", "كافة قطاعات مدينة الرياض والمحافظات", 
        len(pending_assigned), len(in_progress_assigned), len(processed_assigned), len(active_assigned),
        sum(1 for r in active_assigned if (r.get('ageDays') or 0) <= 30),
        sum(1 for r in active_assigned if 30 < (r.get('ageDays') or 0) <= 60),
        sum(1 for r in active_assigned if 60 < (r.get('ageDays') or 0) <= 90),
        sum(1 for r in active_assigned if 90 < (r.get('ageDays') or 0) <= 180),
        sum(1 for r in active_assigned if (r.get('ageDays') or 0) > 180),
        f"{stats_data.get('avgDelay', 155)} يوم", "-", "-"
    ]
    ws_kpi.merge_cells(f"B{curr_row}:C{curr_row}")
    for col_i, v in enumerate(total_cells, start=2):
        if col_i == 3: continue
        c = ws_kpi.cell(row=curr_row, column=col_i, value=v)
        c.font = Font(name="Segoe UI", size=9, bold=True, color=C_PRIMARY_NAVY)
        c.alignment = Alignment(horizontal="center" if col_i not in [2, 4] else "right", vertical="center")
        c.fill = PatternFill(start_color=C_ACCENT_BLUE, end_color=C_ACCENT_BLUE, fill_type="solid")
        c.border = double_bottom_border()

    # جدول 2: المقاولون الأكثر تسجيلاً للبلاغات النشطة بالمشاريع
    curr_row += 3
    ws_kpi.merge_cells(f"B{curr_row}:O{curr_row}")
    ws_kpi.row_dimensions[curr_row].height = 26
    sec2 = ws_kpi[f"B{curr_row}"]
    sec2.value = "⚠️ جدول متابعة المقاولين: قائمة المقاولين الأكثر تسجيلاً للبلاغات النشطة بالمشاريع الجارية"
    sec2.font = Font(name="Segoe UI", size=11, bold=True, color=C_WHITE)
    sec2.alignment = Alignment(horizontal="right", vertical="center")
    sec2.fill = PatternFill(start_color=C_SUB_HEADER, end_color=C_SUB_HEADER, fill_type="solid")

    curr_row += 1
    ws_kpi.row_dimensions[curr_row].height = 26
    ws_kpi.merge_cells(f"J{curr_row}:O{curr_row}")

    headers_c_map = [
        (2, "م"), (3, "اسم المقاول المنفذ"), (4, "مدير البرنامج المشرف"), 
        (5, "معلقة (المقاول)"), (6, "تحت الإجراء 🔄"), (7, "إجمالي النشط"),
        (8, "أقدم بلاغ"), (9, "الحالة الغالبة")
    ]
    for ci, h_txt in headers_c_map:
        c = ws_kpi.cell(row=curr_row, column=ci, value=h_txt)
        c.fill = PatternFill(start_color=C_PRIMARY_NAVY, end_color=C_PRIMARY_NAVY, fill_type="solid")
        c.font = Font(name="Segoe UI", size=9, bold=True, color=C_WHITE)
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = thin_border()

    c_act = ws_kpi.cell(row=curr_row, column=10, value="الإجراء التنفيذي المطلوب والتوجيه الإداري")
    c_act.fill = PatternFill(start_color=C_PRIMARY_NAVY, end_color=C_PRIMARY_NAVY, fill_type="solid")
    c_act.font = Font(name="Segoe UI", size=9, bold=True, color=C_WHITE)
    c_act.alignment = Alignment(horizontal="center", vertical="center")
    for ci in range(10, 16):
        ws_kpi.cell(row=curr_row, column=ci).border = thin_border()

    contractors_map = {}
    for r in active_assigned:
        if r.get('excluded') or not r.get('matched') or not r.get('project'):
            continue
        c_name = (r['project'].get('contractor') or r.get('contractorName') or '').strip()
        if not c_name or c_name == '-' or c_name == 'غير محدد' or c_name.upper() == 'NULL':
            continue
        mgr_name = r['project'].get('programManager', 'غير محدد')
        if c_name not in contractors_map:
            contractors_map[c_name] = {'pending': 0, 'in_prog': 0, 'total': 0, 'managers': set(), 'ages': [], 'statuses': {}}
        contractors_map[c_name]['total'] += 1
        if r.get('status') == 'تحت معالجة المقاول':
            contractors_map[c_name]['pending'] += 1
        else:
            contractors_map[c_name]['in_prog'] += 1
        contractors_map[c_name]['managers'].add(mgr_name)
        contractors_map[c_name]['ages'].append(r.get('ageDays', 0))
        st = r.get('status', 'تحت معالجة المقاول')
        contractors_map[c_name]['statuses'][st] = contractors_map[c_name]['statuses'].get(st, 0) + 1

    sorted_contractors = sorted(contractors_map.items(), key=lambda x: (-x[1]['total'], -x[1]['pending']))
    
    curr_row += 1
    for c_idx, (c_name, c_data) in enumerate(sorted_contractors, start=1):
        ws_kpi.row_dimensions[curr_row].height = 22
        ws_kpi.merge_cells(f"J{curr_row}:O{curr_row}")
        
        max_age = max(c_data['ages']) if c_data['ages'] else 0
        top_status = max(c_data['statuses'].items(), key=lambda x: x[1])[0] if c_data['statuses'] else 'تحت المعالجة'
        mgrs_str = "، ".join(c_data['managers'])
        
        if max_age > 180:
            c_action = f"تطبيق اشتراطات العقد وغرامات تعطيل المرافق فوراً لإغلاق البلاغ المتأخر ({max_age} يوماً)"
        elif c_data['pending'] > 0:
            c_action = f"إلزام المقاول بالمعالجة الميدانية والتنسيق مع الجهة المتضررة لرفع محضر الإنجاز"
        else:
            c_action = "متابعة استكمال الإجراءات الإدارية وإغلاق البلاغ مع الجهة المتعدية"

        is_even = (c_idx % 2 == 0)
        row_bg = C_ZEBRA if is_even else C_WHITE

        ws_kpi.cell(row=curr_row, column=2, value=c_idx)
        ws_kpi.cell(row=curr_row, column=3, value=c_name)
        ws_kpi.cell(row=curr_row, column=4, value=mgrs_str)
        ws_kpi.cell(row=curr_row, column=5, value=c_data['pending'])
        ws_kpi.cell(row=curr_row, column=6, value=c_data['in_prog'])
        ws_kpi.cell(row=curr_row, column=7, value=c_data['total'])
        ws_kpi.cell(row=curr_row, column=8, value=f"{max_age} يوم")
        ws_kpi.cell(row=curr_row, column=9, value=top_status)
        ws_kpi.cell(row=curr_row, column=10, value=c_action)

        for ci in range(2, 16):
            cell = ws_kpi.cell(row=curr_row, column=ci)
            cell.font = Font(name="Segoe UI", size=9, bold=(ci in [3, 7]), color=C_DARK_TEXT)
            cell.alignment = Alignment(horizontal="right" if ci in [3, 4, 10] else "center", vertical="center")
            cell.fill = PatternFill(start_color=row_bg, end_color=row_bg, fill_type="solid")
            cell.border = thin_border()
            if ci == 5 and c_data['pending'] > 0:
                cell.font = Font(name="Segoe UI", size=9, bold=True, color=C_ROYAL_BLUE)
            elif ci == 6 and c_data['in_prog'] > 0:
                cell.font = Font(name="Segoe UI", size=9, bold=True, color='D97706')
            elif ci == 8 and max_age > 180:
                cell.font = Font(name="Segoe UI", size=9, bold=True, color='991B1B')

        curr_row += 1

    # ضبط عروض أعمدة ورقة المؤشرات
    ws_kpi.column_dimensions['A'].width = 3
    ws_kpi.column_dimensions['B'].width = 5
    ws_kpi.column_dimensions['C'].width = 25
    ws_kpi.column_dimensions['D'].width = 24
    ws_kpi.column_dimensions['E'].width = 16
    ws_kpi.column_dimensions['F'].width = 15
    ws_kpi.column_dimensions['G'].width = 15
    ws_kpi.column_dimensions['H'].width = 14
    ws_kpi.column_dimensions['I'].width = 13
    ws_kpi.column_dimensions['J'].width = 13
    ws_kpi.column_dimensions['K'].width = 13
    ws_kpi.column_dimensions['L'].width = 13
    ws_kpi.column_dimensions['M'].width = 14
    ws_kpi.column_dimensions['N'].width = 16
    ws_kpi.column_dimensions['O'].width = 25

    # -------------------------------------------------------------
    # 2. ورقة العمل الثانية: 📋 بلاغات المشاريع المعلقة (16 بلاغاً)
    # -------------------------------------------------------------
    ws_pending = wb.create_sheet(title=f"بلاغات المعلقة ({len(pending_assigned)})")
    write_reports_table(
        ws_pending,
        pending_assigned,
        "سجل بلاغات التعدي المعلقة (تحت معالجة المقاول) للمشاريع الرأسمالية الجارية (NWC)",
        f"تاريخ التدقيق: 19 سبتمبر 2026 | البلاغات المعلقة تحت معالجة المقاول فقط | إجمالي: {len(pending_assigned)} بلاغاً"
    )

    # -------------------------------------------------------------
    # 3. ورقة العمل الثالثة: 🔄 بلاغات تحت الإجراء (33 بلاغاً)
    # -------------------------------------------------------------
    ws_in_prog = wb.create_sheet(title=f"بلاغات تحت الإجراء ({len(in_progress_assigned)})")
    write_reports_table(
        ws_in_prog,
        in_progress_assigned,
        "سجل بلاغات التعدي تحت الإجراء (متابعات واعتماد الجهات) للمشاريع الرأسمالية الجارية (NWC)",
        f"تاريخ التدقيق: 19 سبتمبر 2026 | بلاغات لا تنطبق عليها تحت معالجة المقاول وليست تمت المعالجة | إجمالي: {len(in_progress_assigned)} بلاغاً"
    )

    # -------------------------------------------------------------
    # 4. ورقات عمل منفصلة لكل مدير برنامج لديه بلاغات نشطة
    # -------------------------------------------------------------
    for mgr in all_ten_managers:
        mgr_name = mgr['name']
        mgr_scope = mgr['scope']
        mgr_phone = mgr['phone']
        mgr_email = mgr['email']

        mgr_reports = [r for r in active_assigned if r['project'].get('programManager') == mgr_name]
        if not mgr_reports:
            continue

        mgr_pending_count = sum(1 for r in mgr_reports if r.get('status') == 'تحت معالجة المقاول')
        mgr_in_prog_count = len(mgr_reports) - mgr_pending_count

        sheet_title = mgr_name.replace('العنزي', '').replace('الاسمري', '').replace('يحيى', '').strip()
        sheet_title = f"{sheet_title} ({len(mgr_reports)})"
        
        ws_m = wb.create_sheet(title=sheet_title)
        setup_sheet_view(ws_m)

        ws_m.merge_cells("A1:T1")
        ws_m.row_dimensions[1].height = 36
        h_m = ws_m["A1"]
        h_m.value = f"تقرير بلاغات التعدي النشطة الخاصة بمدير البرنامج: {mgr_name}"
        h_m.font = Font(name="Segoe UI", size=14, bold=True, color=C_WHITE)
        h_m.alignment = Alignment(horizontal="center", vertical="center")
        h_m.fill = PatternFill(start_color=C_PRIMARY_NAVY, end_color=C_PRIMARY_NAVY, fill_type="solid")

        ws_m.merge_cells("A2:T2")
        ws_m.row_dimensions[2].height = 22
        h_ms = ws_m["A2"]
        h_ms.value = f"النطاق: {mgr_scope} | الجوال: {mgr_phone} | معلقة (المقاول): {mgr_pending_count} | تحت الإجراء: {mgr_in_prog_count} | إجمالي النشط: {len(mgr_reports)} بلاغاً"
        h_ms.font = Font(name="Segoe UI", size=9.5, bold=True, color="E2E8F0")
        h_ms.alignment = Alignment(horizontal="center", vertical="center")
        h_ms.fill = PatternFill(start_color=C_HEADER_FILL, end_color=C_HEADER_FILL, fill_type="solid")

        headers_m = [
            "م", "رقم البلاغ", "تصنيف الإجراء", "اسم المشروع", "رقم العملية", "أمر الشراء (PO)",
            "مقاول المشروع", "الاستشاري", "القطاع", "الحي", "الشارع",
            "تاريخ البلاغ", "عمر البلاغ", "شريحة العمر والمخاطر", "حالة البلاغ في النظام",
            "الجهة المالكة", "الجهة المتعدية", "وصف التعدي والأثر الميداني", "تعليق المركز", "الإجراء التنفيذي المطلوب"
        ]

        ws_m.row_dimensions[4].height = 28
        for col_i, h in enumerate(headers_m, start=1):
            c = ws_m.cell(row=4, column=col_i, value=h)
            c.font = Font(name="Segoe UI", size=9, bold=True, color=C_WHITE)
            c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            c.fill = PatternFill(start_color=C_SUB_HEADER, end_color=C_SUB_HEADER, fill_type="solid")
            c.border = thin_border()

        for idx, rep in enumerate(mgr_reports, start=1):
            r_num = idx + 4
            ws_m.row_dimensions[r_num].height = 24
            age_days = rep.get('ageDays', 0)
            aging_info = get_aging_info(age_days)
            proj = rep.get('project', {})
            status = rep.get('status', 'تحت معالجة المقاول')
            rec_action = get_recommended_action(rep)
            action_cat = "معلقة (تحت المقاول) ⏳" if status == 'تحت معالجة المقاول' else "تحت الإجراء 🔄"

            m_row_data = [
                idx,
                rep.get('id', ''),
                action_cat,
                proj.get('name', ''),
                proj.get('operationNumber', '-'),
                proj.get('po', '-'),
                proj.get('contractor', rep.get('contractorName', '-')),
                proj.get('consultant', '-'),
                rep.get('sector', 'صرف'),
                rep.get('district', '-'),
                rep.get('street', '-'),
                rep.get('dateReport', rep.get('dateIncident', '-')),
                f"{age_days} يوم",
                aging_info['label'],
                status,
                rep.get('ownerEntity', '-'),
                rep.get('encroachingEntity', '-'),
                f"{rep.get('description', '')} | الأثر: {rep.get('impact', '')}",
                rep.get('centerComment', '-'),
                rec_action
            ]

            is_even = (idx % 2 == 0)
            row_bg = C_ZEBRA if is_even else C_WHITE

            for col_i, val in enumerate(m_row_data, start=1):
                c = ws_m.cell(row=r_num, column=col_i, value=clean_val(val))
                c.font = Font(name="Segoe UI", size=9, color=C_DARK_TEXT)
                c.fill = PatternFill(start_color=row_bg, end_color=row_bg, fill_type="solid")
                c.border = thin_border()

                if col_i in [1, 2, 3, 5, 6, 9, 12, 13]:
                    c.alignment = Alignment(horizontal="center", vertical="center")
                else:
                    c.alignment = Alignment(horizontal="right", vertical="center")

                if col_i == 2:
                    c.font = Font(name="Segoe UI", size=9, bold=True, color=C_ROYAL_BLUE)
                elif col_i == 3:
                    if "معلقة" in action_cat:
                        c.fill = PatternFill(start_color='FEF3C7', end_color='FEF3C7', fill_type="solid")
                        c.font = Font(name="Segoe UI", size=8.5, bold=True, color='92400E')
                    else:
                        c.fill = PatternFill(start_color='E0F2FE', end_color='E0F2FE', fill_type="solid")
                        c.font = Font(name="Segoe UI", size=8.5, bold=True, color='075985')
                elif col_i == 14:
                    c.fill = PatternFill(start_color=aging_info['fill'], end_color=aging_info['fill'], fill_type="solid")
                    c.font = Font(name="Segoe UI", size=8.5, bold=True, color=aging_info['text'])
                    c.alignment = Alignment(horizontal="center", vertical="center")
                elif col_i == 15:
                    st_color = COLORS_STATUS.get(status, {'fill': 'F1F5F9', 'text': '334155'})
                    c.fill = PatternFill(start_color=st_color['fill'], end_color=st_color['fill'], fill_type="solid")
                    c.font = Font(name="Segoe UI", size=8, bold=True, color=st_color['text'])
                    c.alignment = Alignment(horizontal="center", vertical="center")
                elif col_i == 20:
                    c.font = Font(name="Segoe UI", size=8.5, bold=True, color='831843' if age_days > 180 else '0F3B66')

        ws_m.freeze_panes = "A5"
        ws_m.auto_filter.ref = f"A4:T{len(mgr_reports) + 4}"
        auto_fit_columns(ws_m, max_cols=20, max_width_limit=45)
        ws_m.column_dimensions['A'].width = 5
        ws_m.column_dimensions['B'].width = 14
        ws_m.column_dimensions['C'].width = 20
        ws_m.column_dimensions['D'].width = 38
        ws_m.column_dimensions['G'].width = 28
        ws_m.column_dimensions['N'].width = 25
        ws_m.column_dimensions['O'].width = 22
        ws_m.column_dimensions['R'].width = 45
        ws_m.column_dimensions['S'].width = 40
        ws_m.column_dimensions['T'].width = 42

    # -------------------------------------------------------------
    # 5. ورقة العمل: 🚫 البلاغات المستبعدة من نطاق مدراء البرامج
    # -------------------------------------------------------------
    excluded_reports = [r for r in all_reports if r.get('excluded')]
    excluded_reports.sort(key=lambda r: -(r.get('ageDays') or 0))

    if excluded_reports:
        ws_exc = wb.create_sheet(title=f"البلاغات المستبعدة ({len(excluded_reports)})")
        setup_sheet_view(ws_exc)

        ws_exc.merge_cells("A1:N1")
        ws_exc.row_dimensions[1].height = 36
        h_exc = ws_exc["A1"]
        h_exc.value = "سجل البلاغات المستبعدة من نطاق المشاريع الرأسمالية ومدراء البرامج (إحالة للتشغيل والصيانة)"
        h_exc.font = Font(name="Segoe UI", size=14, bold=True, color=C_WHITE)
        h_exc.alignment = Alignment(horizontal="center", vertical="center")
        h_exc.fill = PatternFill(start_color=C_PRIMARY_NAVY, end_color=C_PRIMARY_NAVY, fill_type="solid")

        ws_exc.merge_cells("A2:N2")
        ws_exc.row_dimensions[2].height = 22
        h_excs = ws_exc["A2"]
        h_excs.value = f"إجمالي البلاغات المستبعدة: {len(excluded_reports)} بلاغاً | الحالة: خارج نطاق التزامات مقاولي المشاريع الجارية"
        h_excs.font = Font(name="Segoe UI", size=9.5, bold=True, color="E2E8F0")
        h_excs.alignment = Alignment(horizontal="center", vertical="center")
        h_excs.fill = PatternFill(start_color=C_HEADER_FILL, end_color=C_HEADER_FILL, fill_type="solid")

        headers_exc = [
            "م", "رقم البلاغ", "حالة الاستبعاد", "سبب ومبرر الاستبعاد",
            "المقاول المسجل", "القطاع", "المدينة", "الحي", "الشارع",
            "تاريخ البلاغ", "عمر البلاغ (يوم)", "الجهة المالكة", "الجهة المتعدية", "التوجيه الإداري المعتمد"
        ]

        ws_exc.row_dimensions[4].height = 28
        for col_i, h in enumerate(headers_exc, start=1):
            c = ws_exc.cell(row=4, column=col_i, value=h)
            c.font = Font(name="Segoe UI", size=9, bold=True, color=C_WHITE)
            c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            c.fill = PatternFill(start_color=C_SUB_HEADER, end_color=C_SUB_HEADER, fill_type="solid")
            c.border = thin_border()

        for idx, rep in enumerate(excluded_reports, start=1):
            r_num = idx + 4
            ws_exc.row_dimensions[r_num].height = 22
            age_days = rep.get('ageDays', 0)
            reason = rep.get('excludedReason', 'مستبعد من نطاق مشاريع مدير البرنامج')

            exc_row_data = [
                idx,
                rep.get('id', ''),
                "مستبعد من مدير البرنامج 🚫",
                reason,
                rep.get('contractorName', '-'),
                rep.get('sector', 'صرف'),
                rep.get('city', 'الرياض'),
                rep.get('district', '-'),
                rep.get('street', '-'),
                rep.get('dateReport', rep.get('dateIncident', '-')),
                age_days,
                rep.get('ownerEntity', '-'),
                rep.get('encroachingEntity', '-'),
                "إحالة إلى إدارة التشغيل والصيانة / شبكة قائمة ومسلمة"
            ]

            is_even = (idx % 2 == 0)
            row_bg = C_ZEBRA if is_even else C_WHITE

            for col_i, val in enumerate(exc_row_data, start=1):
                c = ws_exc.cell(row=r_num, column=col_i, value=clean_val(val))
                c.font = Font(name="Segoe UI", size=9, color=C_DARK_TEXT)
                c.fill = PatternFill(start_color=row_bg, end_color=row_bg, fill_type="solid")
                c.border = thin_border()

                if col_i in [1, 2, 6, 7, 10, 11]:
                    c.alignment = Alignment(horizontal="center", vertical="center")
                else:
                    c.alignment = Alignment(horizontal="right", vertical="center")

                if col_i == 2:
                    c.font = Font(name="Segoe UI", size=9, bold=True, color=C_ROYAL_BLUE)
                elif col_i == 3:
                    c.fill = PatternFill(start_color='FEE2E2', end_color='FEE2E2', fill_type="solid")
                    c.font = Font(name="Segoe UI", size=8.5, bold=True, color='991B1B')
                    c.alignment = Alignment(horizontal="center", vertical="center")
                elif col_i == 4:
                    c.font = Font(name="Segoe UI", size=8.5, bold=True, color='9A3412')

        ws_exc.freeze_panes = "A5"
        ws_exc.auto_filter.ref = f"A4:N{len(excluded_reports) + 4}"
        auto_fit_columns(ws_exc, max_cols=14, max_width_limit=45)
        ws_exc.column_dimensions['A'].width = 5
        ws_exc.column_dimensions['B'].width = 14
        ws_exc.column_dimensions['C'].width = 22
        ws_exc.column_dimensions['D'].width = 38
        ws_exc.column_dimensions['E'].width = 28
        ws_exc.column_dimensions['N'].width = 42

    # -------------------------------------------------------------
    # 6. ورقة العمل: 🌐 كافة البلاغات المعلقة بالمنظومة
    # -------------------------------------------------------------
    ws_all = wb.create_sheet(title=f"كافة المعلق بالشركة ({len(all_pending)})")
    setup_sheet_view(ws_all)

    ws_all.merge_cells("A1:Q1")
    ws_all.row_dimensions[1].height = 36
    h_all = ws_all["A1"]
    h_all.value = "السجل الشامل لكافة بلاغات التعدي المعلقة بشركة المياه الوطنية (NWC) - مشاريع وتشغيل وصيانة"
    h_all.font = Font(name="Segoe UI", size=14, bold=True, color=C_WHITE)
    h_all.alignment = Alignment(horizontal="center", vertical="center")
    h_all.fill = PatternFill(start_color=C_PRIMARY_NAVY, end_color=C_PRIMARY_NAVY, fill_type="solid")

    ws_all.merge_cells("A2:Q2")
    ws_all.row_dimensions[2].height = 22
    h_as = ws_all["A2"]
    h_as.value = f"إجمالي البلاغات المعلقة غير المغلقة: {len(all_pending)} بلاغاً ({len(pending_assigned)} مشاريع جارية معتمدة + {len(all_pending) - len(pending_assigned)} تشغيل وصيانة وشبكات قائمة ومستبعدة)"
    h_as.font = Font(name="Segoe UI", size=9, bold=True, color="E2E8F0")
    h_as.alignment = Alignment(horizontal="center", vertical="center")
    h_as.fill = PatternFill(start_color=C_HEADER_FILL, end_color=C_HEADER_FILL, fill_type="solid")

    headers_all = [
        "م", "رقم البلاغ", "مسار التوجيه والقطاع", "الجهة / مدير البرنامج المسؤول",
        "اسم المشروع / الشبكة", "المقاول المسجل بالبلاغ", "المدينة", "الحي", "الشارع",
        "تاريخ البلاغ", "عمر البلاغ (يوم)", "شريحة العمر والمخاطر", "حالة البلاغ في المنظومة",
        "الجهة المالكة للمرفق", "الجهة المتعدية", "وصف التعدي", "تعليق المركز"
    ]

    ws_all.row_dimensions[4].height = 28
    for col_i, h in enumerate(headers_all, start=1):
        c = ws_all.cell(row=4, column=col_i, value=h)
        c.font = Font(name="Segoe UI", size=9, bold=True, color=C_WHITE)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.fill = PatternFill(start_color=C_SUB_HEADER, end_color=C_SUB_HEADER, fill_type="solid")
        c.border = thin_border()

    for idx, rep in enumerate(all_pending, start=1):
        r_num = idx + 4
        ws_all.row_dimensions[r_num].height = 22
        age_days = rep.get('ageDays', 0)
        aging_info = get_aging_info(age_days)
        is_assigned_proj = rep.get('matched') and rep.get('project') and not rep.get('excluded')
        
        if is_assigned_proj:
            routing_cat = "مشروع جاري معتمد 🟢"
            resp_entity = rep['project'].get('programManager', 'مدير البرنامج')
            proj_name = rep['project'].get('name', '')
            contractor_final = rep['project'].get('contractor', rep.get('contractorName', ''))
        elif rep.get('excluded'):
            routing_cat = "تشغيل وصيانة (مستبعد من المشاريع) ⚙️"
            resp_entity = "إدارة التشغيل والصيانة / شبكة قائمة"
            proj_name = "شبكة قائمة / صيانة دورية"
            contractor_final = rep.get('contractorName', '-')
        else:
            routing_cat = "تشغيل وصيانة (شبكة قائمة) ⚙️"
            resp_entity = "إدارة التشغيل والصيانة / خدمات فنية"
            proj_name = "شبكة قائمة ومسلمة"
            contractor_final = rep.get('contractorName', '-')

        status = rep.get('status', 'تحت معالجة المقاول')

        row_vals_all = [
            idx,
            rep.get('id', ''),
            routing_cat,
            resp_entity,
            proj_name,
            contractor_final,
            rep.get('city', 'الرياض'),
            rep.get('district', '-'),
            rep.get('street', '-'),
            rep.get('dateReport', rep.get('dateIncident', '-')),
            age_days,
            aging_info['label'],
            status,
            rep.get('ownerEntity', '-'),
            rep.get('encroachingEntity', '-'),
            rep.get('description', '-'),
            rep.get('centerComment', '-')
        ]

        is_even = (idx % 2 == 0)
        row_bg = C_ZEBRA if is_even else C_WHITE

        for col_i, val in enumerate(row_vals_all, start=1):
            c = ws_all.cell(row=r_num, column=col_i, value=clean_val(val))
            c.font = Font(name="Segoe UI", size=9, color=C_DARK_TEXT)
            c.fill = PatternFill(start_color=row_bg, end_color=row_bg, fill_type="solid")
            c.border = thin_border()

            if col_i in [1, 2, 3, 10, 11]:
                c.alignment = Alignment(horizontal="center", vertical="center")
            else:
                c.alignment = Alignment(horizontal="right", vertical="center")

            if col_i == 2:
                c.font = Font(name="Segoe UI", size=9, bold=True, color=C_ROYAL_BLUE)
            elif col_i == 3 and is_assigned_proj:
                c.font = Font(name="Segoe UI", size=9, bold=True, color='166534')
                c.fill = PatternFill(start_color='DCFCE7', end_color='DCFCE7', fill_type="solid")
            elif col_i == 12:
                c.fill = PatternFill(start_color=aging_info['fill'], end_color=aging_info['fill'], fill_type="solid")
                c.font = Font(name="Segoe UI", size=8.5, bold=True, color=aging_info['text'])
                c.alignment = Alignment(horizontal="center", vertical="center")
            elif col_i == 13:
                st_color = COLORS_STATUS.get(status, {'fill': 'F1F5F9', 'text': '334155'})
                c.fill = PatternFill(start_color=st_color['fill'], end_color=st_color['fill'], fill_type="solid")
                c.font = Font(name="Segoe UI", size=8, bold=True, color=st_color['text'])
                c.alignment = Alignment(horizontal="center", vertical="center")

    ws_all.freeze_panes = "A5"
    ws_all.auto_filter.ref = f"A4:Q{len(all_pending) + 4}"
    auto_fit_columns(ws_all, max_cols=17, max_width_limit=45)
    ws_all.column_dimensions['A'].width = 6
    ws_all.column_dimensions['B'].width = 14
    ws_all.column_dimensions['C'].width = 28
    ws_all.column_dimensions['D'].width = 28
    ws_all.column_dimensions['E'].width = 35
    ws_all.column_dimensions['F'].width = 28
    ws_all.column_dimensions['L'].width = 25
    ws_all.column_dimensions['M'].width = 22
    ws_all.column_dimensions['P'].width = 40
    ws_all.column_dimensions['Q'].width = 40

    # حفظ الملف
    output_filename = "تقرير_البلاغات_المعلقة_التنفيذي_الشامل_NWC.xlsx"
    output_path = os.path.join(OUTPUT_DIR, output_filename)
    wb.save(output_path)

    print(f"🎉 تم إنشاء وتنسيق الملف بنجاح في المسار:")
    print(f"👉 {output_path}")
    print(f"📊 حجم الملف: {round(os.path.getsize(output_path) / 1024, 1)} KB")
    print(f"📑 عدد أوراق العمل: {len(wb.sheetnames)}")
    for sname in wb.sheetnames:
        print(f"   • {sname}")

if __name__ == '__main__':
    main()
