import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseProjects } from '../server/src/pipeline/parseProjects.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const refDir = path.join(__dirname, '../server/data/reference')
if (!fs.existsSync(refDir)) {
  fs.mkdirSync(refDir, { recursive: true })
}

const projects = parseProjects()

// 1. Build managers_registry.json
// Group by program manager
const managerMap = new Map()

const PM_DIRECT_MAPPING = {
  'تركي ظافر يحيى الاسمري': {
    executiveManager: 'عبدالله بن ظافر الدوسري',
    defaultPhone: '505244957',
    defaultEmail: 'tlasmari@nwc.com.sa',
    aliases: ['تركي الاسمري', 'م. تركي الاسمري', 'تركي ظافر الاسمري', 'تركي ظافر يحيى الاسمري']
  },
  'عسكر لسلوم': {
    executiveManager: 'عبدالله بن ظافر الدوسري',
    defaultPhone: '555225114',
    defaultEmail: 'alasloom@nwc.com.sa',
    aliases: ['عسكر لسلوم', 'م. عسكر لسلوم', 'عسكر لسوم', 'م. عسكر لسوم']
  },
  'عبدالله علي العنزي': {
    executiveManager: 'عبدالله بن ظافر الدوسري',
    defaultPhone: '503111003',
    defaultEmail: 'aalenazi@nwc.com.sa',
    aliases: ['عبدالله العنزي', 'م. عبدالله العنزي', 'عبدالله علي العنزي']
  },
  'سفر العتيبي': {
    executiveManager: 'عبدالله بن ظافر الدوسري',
    defaultPhone: '555212555',
    defaultEmail: 'smotaibi@nwc.com.sa',
    aliases: ['سفر العتيبي', 'م. سفر العتيبي']
  },
  'علي الشهري': {
    executiveManager: 'عبدالله بن ظافر الدوسري',
    defaultPhone: '504285141',
    defaultEmail: 'ashehri@nwc.com.sa',
    aliases: ['علي الشهري', 'م. علي الشهري']
  },
  'أمجد الفالح': {
    executiveManager: 'عبدالله بن ظافر الدوسري',
    defaultPhone: '505488426',
    defaultEmail: 'afaleh@nwc.com.sa',
    aliases: ['أمجد الفالح', 'امجد الفالح', 'م. أمجد الفالح', 'م. امجد الفالح']
  },
  'عبدالله الأسود العنزي': {
    executiveManager: 'عبدالله العجمي',
    defaultPhone: '555464147',
    defaultEmail: 'aenazi@nwc.com.sa',
    aliases: ['عبدالله الأسود العنزي', 'عبدالله الاسود العنزي', 'عبدالله الأسود', 'عبدالله الاسود', 'م. عبدالله الاسود']
  },
  'فهد العنزي': {
    executiveManager: 'عسكر لسلوم',
    defaultPhone: '555278400',
    defaultEmail: 'fhalenazi@nwc.com.sa',
    aliases: ['فهد العنزي', 'م. فهد العنزي', 'م / فهد العنزي']
  },
  'علي القحطاني': {
    executiveManager: 'عسكر لسلوم',
    defaultPhone: '555299813',
    defaultEmail: 'aaalqahtani@nwc.com.sa',
    aliases: ['علي القحطاني', 'م. علي القحطاني', 'م/ علي القحطاني']
  },
  'شاكر الحقباني': {
    executiveManager: 'ثامر النوفل',
    defaultPhone: '555022025',
    defaultEmail: 'talnoufal@nwc.com.sa',
    aliases: ['شاكر الحقباني', 'م. شاكر الحقباني']
  },
  'سعيد الحارث': {
    executiveManager: 'رامي الحسني',
    defaultPhone: '598991815',
    defaultEmail: 'salharth@nwc.com.sa',
    aliases: ['سعيد الحارث', 'م. سعيد الحارث', 'م.سعيد الحارث']
  }
}

for (const p of projects) {
  const pm = p.programManager || 'غير محدد'
  if (!managerMap.has(pm)) {
    const meta = PM_DIRECT_MAPPING[pm] || {}
    managerMap.set(pm, {
      programManager: pm,
      executiveManager: meta.executiveManager || p.executiveManager || 'غير محدد',
      phone: p.progPhone && p.progPhone !== '-' ? p.progPhone : (meta.defaultPhone || '-'),
      email: p.progEmail && p.progEmail !== '-' ? p.progEmail : (meta.defaultEmail || '-'),
      aliases: meta.aliases || [pm],
      projectManagers: new Map(),
      contractors: new Set(),
      projects: []
    })
  }

  const mgrEntry = managerMap.get(pm)
  mgrEntry.projects.push({
    id: p.id,
    operationNumber: p.operationNumber,
    name: p.name,
    scope: p.scope,
    status: p.status,
    contractor: p.contractor,
    projectManager: p.projectManager && p.projectManager !== '-' ? p.projectManager : null,
    subProgram: p.subProgram
  })

  if (p.contractor) {
    mgrEntry.contractors.add(p.contractor)
  }

  if (p.projectManager && p.projectManager !== '-' && p.projectManager !== 'غير محدد') {
    const pName = p.projectManager.replace(/^م[\.\/]\s*/, '').trim()
    if (!mgrEntry.projectManagers.has(pName)) {
      mgrEntry.projectManagers.set(pName, {
        name: pName,
        phone: p.projPhone && p.projPhone !== '-' ? p.projPhone : '-',
        email: p.projEmail && p.projEmail !== '-' ? p.projEmail : '-',
        projectsCount: 1,
        projectIds: [p.id]
      })
    } else {
      const pmData = mgrEntry.projectManagers.get(pName)
      pmData.projectsCount++
      pmData.projectIds.push(p.id)
      if (pmData.phone === '-' && p.projPhone && p.projPhone !== '-') pmData.phone = p.projPhone
      if (pmData.email === '-' && p.projEmail && p.projEmail !== '-') pmData.email = p.projEmail
    }
  }
}

const managersRegistry = Array.from(managerMap.values()).map(m => ({
  programManager: m.programManager,
  executiveManager: m.executiveManager,
  phone: m.phone,
  email: m.email,
  aliases: m.aliases,
  totalProjects: m.projects.length,
  projectManagers: Array.from(m.projectManagers.values()),
  contractors: Array.from(m.contractors),
  projects: m.projects
}))

fs.writeFileSync(
  path.join(refDir, 'managers_registry.json'),
  JSON.stringify(managersRegistry, null, 2),
  'utf-8'
)
console.log(`✓ تم إنشاء managers_registry.json بنجاح (${managersRegistry.length} مدراء برامج)`)

// 2. Build contractors_registry.json
// Classification based on:
// 1. Capital projects registered in NWC_Projects
// 2. Specified Maintenance contractors (Operation & Maintenance)
const MAINTENANCE_CONTRACTORS = [
  {
    name: 'شركة الأعمال المدنية المحدودة',
    aliases: ['شركة الاعمال المدنية المحدودة', 'الاعمال المدنية', 'شركة الأعمال المدنية', 'الاعمال المدنيه'],
    classification: 'maintenance',
    maintenanceScope: 'تشغيل وصيانة شبكات وتوصيلات',
    exceptionRule: {
      allowedProjectId: '57',
      allowedDistrict: 'العوالي',
      notes: 'تُستبعد جميع بلاغاتها كصيانة باستثناء مشروع شبكات صرف صحي بحي العوالي المرحلة الأولى (#57) عند تطابق حي العوالي'
    }
  },
  {
    name: 'شركة البنية الأساسية للمقاولات',
    aliases: ['شركة البنية الاساسية للمقاولات', 'شركة البنية الاساسية للمقاولات شركة شخص واحد', 'البنية الاساسية'],
    classification: 'maintenance',
    maintenanceScope: 'توصيلات منزلية وتشغيل وصيانة'
  },
  {
    name: 'شركة ماءك للمقاولات',
    aliases: ['شركة ماءك للمقاولات', 'ماءك للمقاولات', 'ماءك'],
    classification: 'maintenance',
    maintenanceScope: 'توصيلات منزلية وتشغيل وصيانة (مشاريعها القديمة خارج نطاق الرياض أو مسلمة)'
  },
  {
    name: 'شركة اليمامة للأعمال التجارية والمقاولات',
    aliases: ['شركةاليمامة للاعمال التجارية والمقاولات مساهمة مقفلة', 'شركة اليمامة للأعمال التجارية والمقاولات مساهمة مقفلة', 'شركة اليمامة للأعمال التجارية والمقاولات  مساهمة مقفلة', 'شركة اليمامة للاعمال التجارية والمقاولات', 'اليمامة'],
    classification: 'maintenance',
    maintenanceScope: 'توصيلات منزلية (عقد إيصال 2) وتشغيل وصيانة'
  },
  {
    name: 'شركة المنار العربية للتجارة والمقاولات',
    aliases: ['شركة المنار العربية للتجارة والمقاولات المحدودة شركة شخص واحد', 'شركة المنار العربية للتجارة والمقاولات', 'المنار العربية'],
    classification: 'maintenance',
    maintenanceScope: 'توصيلات منزلية وتشغيل وصيانة'
  },
  {
    name: 'شركة برق المستقبل للمقاولات',
    aliases: ['شركة برق المستقبل للمقاولات شركة شخص واحد', 'شركة برق المستقبل للمقاولات', 'برق المستقبل'],
    classification: 'maintenance',
    maintenanceScope: 'أعمال طوارئ وانكسارات وتشغيل وصيانة'
  },
  {
    name: 'شركة ضيف الله العتيبى للمقاولات',
    aliases: ['شركة ضيف الله العتيبي للمقاولات', 'شركة ضيف الله العتيبى للمقاولات', 'ضيف الله العتيبي'],
    classification: 'maintenance',
    maintenanceScope: 'تشغيل وصيانة وانكسارات'
  },
  {
    name: 'شركة السبق العربي للتجارة والمقاولات',
    aliases: ['شركة السبق العربي للتجارة والمقاولات', 'السبق العربي'],
    classification: 'maintenance',
    maintenanceScope: 'توصيلات منزلية وتشغيل وصيانة'
  },
  {
    name: 'شركة الخريف لتقنية المياه والطاقة',
    aliases: ['شركة الخريف لتقنية المياه والطاقة شركة مساهمة عامة', 'شركة الخريف لتقنية المياه والطاقة', 'الخريف'],
    classification: 'maintenance',
    maintenanceScope: 'تشغيل وصيانة محطات وشبكات'
  },
  {
    name: 'شركه احمد محي الدين الحرفي وشركاه للمقاولات',
    aliases: ['شركه احمد محي الدين الحرفي وشركاه للمقاولات', 'شركة احمد محي الدين الحرفي وشركاه', 'احمد محي الدين الحرفي'],
    classification: 'maintenance',
    maintenanceScope: 'تشغيل وصيانة وتوصيلات'
  },
  {
    name: 'مؤسسة اضواء رتاج للمقاولات',
    aliases: ['مؤسسة اضواء رتاج للمقاولات', 'مؤسسة أضواء رتاج للمقاولات', 'اضواء رتاج', 'أضواء رتاج'],
    classification: 'maintenance',
    maintenanceScope: 'تشغيل وصيانة وانكسارات بالمحافظات'
  },
  {
    name: 'مؤسسة العرين للمقاولات',
    aliases: ['مؤسسة العرين للمقاولات', 'العرين للمقاولات', 'العرين'],
    classification: 'maintenance',
    maintenanceScope: 'تشغيل وصيانة (باستثناء مشروع مياه النرجس #59 إذا طابق الحي)',
    exceptionRule: {
      allowedProjectId: '59',
      allowedDistrict: 'النرجس',
      notes: 'مشروع شبكات مياه النرجس (#59) تحت م. عبدالله الأسود فقط'
    }
  },
  {
    name: 'شركة مرامر للمقاولات',
    aliases: ['شركة مرامر للمقاولات شركة مساهمة سعودية مقفلة', 'شركة مرامر للمقاولات', 'مرامر'],
    classification: 'maintenance',
    maintenanceScope: 'تشغيل وصيانة'
  },
  {
    name: 'الشركة الدولية لتوزيع المياه',
    aliases: ['الشركه الدولية لتوزيع المياه', 'الشركة الدولية لتوزيع المياه', 'الدولية لتوزيع المياه', 'توزيع المياه'],
    classification: 'maintenance',
    maintenanceScope: 'تشغيل وصيانة وتوزيع المياه'
  },
  {
    name: 'شركة مستورة للتجارة والمقاولات المحدودة',
    aliases: ['شركة مستورة للتجارة والمقاولات المحدودة', 'شركة مستورة للمقاولات المحدودة', 'مستورة'],
    classification: 'maintenance',
    maintenanceScope: 'تشغيل وصيانة وتوصيلات'
  },
  {
    name: 'شركة تطوير المرافق المتقدمة للمقاولات عامة',
    aliases: ['شركة تطوير المرافق المتقدمة للمقاولات عامة', 'تطوير المرافق المتقدمة', 'تطوير المرافق'],
    classification: 'maintenance',
    maintenanceScope: 'تشغيل وصيانة مرافق'
  },
  {
    name: 'شركة الاسس الاولى للمقاولات',
    aliases: ['شركة الاسس الاولى للمقاولات', 'الاسس الاولى للمقاولات', 'الاسس الاولى'],
    classification: 'maintenance',
    maintenanceScope: 'تشغيل وصيانة'
  }
]

// Extract capital contractors from NWC_Projects
const capitalContractorsMap = new Map()

// Defined capital contractors from user specification & NWC_Projects
const SPECIFIED_CAPITAL_CONTRACTORS = [
  {
    name: 'شركة الأومير للمقاولات',
    aliases: ['شركة الاومير للتجارة والمقاولات شركة مساهمة سعودية مقفلة', 'شركة الاومير للتجارة والمقاولات', 'شركة الأومير للتجارة والمقاولات', 'الاومير', 'الأومير'],
    projectNumber: '#62',
    projectName: 'عقد تنفيذ خطوط صرف صحي متفرقة بمدينة الرياض (عقد رقم 26)',
    programManager: 'عبدالله الأسود العنزي',
    projectManager: 'عبدالله الأسود العنزي',
    status: 'قيد التنفيذ (عقود متفرقات)'
  },
  {
    name: 'مجموعة سعد علي العيسى للمقاولات',
    aliases: ['مجموعة سعد علي العيسى للمقاولات شركة شخص واحد', 'مجموعة سعد علي العيسى للمقاولات', 'سعد علي العيسى للمقاولات', 'سعد علي العيسى', 'سعد العيسى', 'العيسى'],
    projectNumber: '#60',
    projectName: 'تنفيذ خطوط صرف صحي متفرقة بمدينة الرياض – عقد رقم 26 – المرحلة الثالثة',
    programManager: 'عبدالله الأسود العنزي',
    projectManager: 'عبدالله الأسود العنزي',
    status: 'قيد التنفيذ (عقود متفرقات)'
  },
  {
    name: 'شركة النمال للمقاولات مساهمة مقفلة',
    aliases: ['شركة النمال للمقاولات مساهمه مقفله', 'شركة النمال للمقاولات مساهمة مقفلة', 'شركة النمال للمقاولات', 'النمال للمقاولات', 'النمال'],
    projectNumber: '#61',
    projectName: 'عقد تنفيذ خطوط صرف صحي متفرقة بمدينة الرياض -عقد 26 المرحلة الرابعة',
    programManager: 'عبدالله الأسود العنزي',
    projectManager: 'عبدالله الأسود العنزي',
    status: 'قيد التنفيذ (عقود متفرقات - شرط مكاني صارم على خطوط الطبقة)',
    strictSpatialCondition: true
  },
  {
    name: 'شركة أنظمة القياس والتحكم الصناعي',
    aliases: ['شركة أنظمة القياس والتحكم الصناعي', 'أنظمة القياس والتحكم الصناعي', 'انظمة القياس والتحكم'],
    projectNumber: '#3',
    projectName: 'تنفيذ مشروع تطبيق وتعزيز برنامج أتمتة شبكة المياه بوحدة أعمال الرياض',
    programManager: 'تركي ظافر يحيى الاسمري',
    projectManager: 'علي بن طالع',
    status: 'جاري'
  },
  {
    name: 'شركة صلت للمقاولات',
    aliases: ['شركة صلت للمقاولات', 'صلت للمقاولات', 'صلت'],
    projectNumber: 'متعدد (#5 بدر، #33 العارض، #42 حطين، #51 عرقة، #55 متفرقات)',
    projectName: 'مشاريع شبكات الصرف الصحي والمياه',
    programManager: 'تركي ظافر يحيى الاسمري / عسكر لسلوم / أمجد الفالح / عبدالله الأسود العنزي',
    projectManager: 'م. عبدالعزيز العتيق / م. ماجد الشمري / مهدي الجوهري',
    status: 'جاري / مسلم ابتدائي / مسحوب'
  },
  {
    name: 'شركة سيسرا المحدودة',
    aliases: ['شركة سيسرا المحدودة', 'سيسرا المحدودة', 'سيسرا'],
    projectNumber: '#7',
    projectName: 'عقد انشاء محطة معالجة أولية لمكب الصهاريج في محطة هيت للمعالجة البيئية',
    programManager: 'تركي ظافر يحيى الاسمري',
    projectManager: 'م. عبدالعزيز العتيق',
    status: 'مسلم ابتدائي'
  },
  {
    name: 'شركة الخط الذهبي للمقاولات',
    aliases: ['شركة الخط الذهبي للمقاولات', 'الخط الذهبي للمقاولات', 'الخط الذهبي'],
    projectNumber: '#8',
    projectName: 'تنفيذ شبكة صرف صحي بأجزاء من احياء الحزم ونمار المرحلة الثالثة',
    programManager: 'تركي ظافر يحيى الاسمري',
    projectManager: 'م. عبدالعزيز العتيق',
    status: 'جاري'
  },
  {
    name: 'شركة دقة الابعاد للمقاولات',
    aliases: ['شركة دقة الابعاد للمقاولات', 'دقة الابعاد للمقاولات', 'دقة الابعاد', 'دقة الأبعاد'],
    projectNumber: '#46',
    projectName: 'عقد استكمال مشاريع المياه بمحافظة حريملاء',
    programManager: 'فهد العنزي',
    projectManager: 'م. فهد العنزي',
    status: 'جاري'
  },
  {
    name: 'شركه اعمال المحترفون للتجارة والمقاولات',
    aliases: ['شركه اعمال المحترفون للتجارة والمقاولات', 'شركة اعمال المحترفون للتجارة والمقاولات', 'أعمال المحترفون', 'اعمال المحترفون'],
    projectNumber: '#47',
    projectName: 'عقد استكمال مشاريع المياه بالمحافظات الشمالية',
    programManager: 'فهد العنزي',
    projectManager: 'م. فهد العنزي',
    status: 'جاري'
  },
  {
    name: 'شركة نظم البيئة للمقاولات',
    aliases: ['شركة نظم البيئة للمقاولات', 'شركة نظم البيئه للمقاولات شركة شخص واحد', 'شركة نظم البيئة للمقاولات شركة شخص واحد', 'نظم البيئة'],
    projectNumber: '#15, #19, #20',
    projectName: 'مخطط استراتيجي 2، معسكر النرجس، طريق خريص القديم',
    programManager: 'سفر العتيبي',
    projectManager: 'مطر سعد مطر الاسلمي الشمري',
    status: 'جاري / مسلم ابتدائي'
  },
  {
    name: 'شركة يالين العربية للمقاولات',
    aliases: ['شركة يالين العربية للمقاولات', 'يالين العربية للمقاولات', 'يالين العربية', 'يالين'],
    projectNumber: '#20',
    projectName: 'إيصال خدمة المياه للمركز الإداري بحي الروضة بالرياض',
    programManager: 'سفر العتيبي',
    projectManager: 'مطر سعد مطر الاسلمي الشمري',
    status: 'مسلم ابتدائي'
  },
  {
    name: 'شركة ثبات للإنشاءات المحدودة',
    aliases: ['شركة ثبات للإنشاءات المحدودة', 'ثبات للإنشاءات المحدودة', 'ثبات للإنشاءات', 'ثبات'],
    projectNumber: '#18',
    projectName: 'عقد تصميم وتنفيذ محطة معالجة مياه الصرف الصحي طريق الخرج المرحلة الثالثة',
    programManager: 'علي الشهري',
    projectManager: 'عبدالرحمن العسافي',
    status: 'مسلم ابتدائي'
  }
]

// Add all other contractors found in active projects
for (const p of projects) {
  if (!p.contractor) continue
  const cName = p.contractor.trim()
  // Check if already in maintenance list
  const isMaint = MAINTENANCE_CONTRACTORS.some(m => m.name === cName || m.aliases.some(a => a.includes(cName) || cName.includes(a)))
  if (isMaint) continue

  if (!capitalContractorsMap.has(cName)) {
    capitalContractorsMap.set(cName, {
      name: cName,
      aliases: [cName],
      classification: 'capital',
      programManagers: [p.programManager],
      projectManagers: p.projectManager && p.projectManager !== '-' ? [p.projectManager] : [],
      projects: [{ id: p.id, name: p.name, scope: p.scope, status: p.status }]
    })
  } else {
    const entry = capitalContractorsMap.get(cName)
    if (!entry.programManagers.includes(p.programManager)) entry.programManagers.push(p.programManager)
    if (p.projectManager && p.projectManager !== '-' && !entry.projectManagers.includes(p.projectManager)) {
      entry.projectManagers.push(p.projectManager)
    }
    entry.projects.push({ id: p.id, name: p.name, scope: p.scope, status: p.status })
  }
}

// Merge specified capital contractors
for (const sc of SPECIFIED_CAPITAL_CONTRACTORS) {
  let matched = null
  for (const [name, data] of capitalContractorsMap.entries()) {
    if (name.includes(sc.name) || sc.name.includes(name) || sc.aliases.some(a => name.includes(a) || a.includes(name))) {
      matched = data
      break
    }
  }

  if (matched) {
    matched.aliases = Array.from(new Set([...matched.aliases, ...sc.aliases]))
    matched.highlightStatus = sc.status
    matched.specifiedProjectNumber = sc.projectNumber
    matched.specifiedProjectName = sc.projectName
    if (sc.strictSpatialCondition) matched.strictSpatialCondition = true
  } else {
    capitalContractorsMap.set(sc.name, {
      name: sc.name,
      aliases: sc.aliases,
      classification: 'capital',
      programManagers: sc.programManager.split(' / '),
      projectManagers: sc.projectManager ? sc.projectManager.split(' / ') : [],
      projects: [{ id: sc.projectNumber, name: sc.projectName, status: sc.status }],
      highlightStatus: sc.status,
      specifiedProjectNumber: sc.projectNumber,
      specifiedProjectName: sc.projectName,
      strictSpatialCondition: !!sc.strictSpatialCondition
    })
  }
}

const contractorsRegistry = {
  metadata: {
    title: 'سجل المقاولين المعتمد والمحمي لمشاريع شركة المياه الوطنية (NWC)',
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    goldenRule: 'المقاول الرأسمالي له مشروع محدد برقم واضح في NWC_Projects ومدير برنامج معروف. مقاول الصيانة يعمل على توصيلات منزلية/انكسارات/صيانة دورية بدون مشروع رأسمالي محدد ويُستبعد من المشاريع الرأسمالية.',
    summary: {
      totalCapitalContractors: capitalContractorsMap.size,
      totalMaintenanceContractors: MAINTENANCE_CONTRACTORS.length
    }
  },
  capitalContractors: Array.from(capitalContractorsMap.values()),
  maintenanceContractors: MAINTENANCE_CONTRACTORS
}

fs.writeFileSync(
  path.join(refDir, 'contractors_registry.json'),
  JSON.stringify(contractorsRegistry, null, 2),
  'utf-8'
)
console.log(`✓ تم إنشاء contractors_registry.json بنجاح (${contractorsRegistry.capitalContractors.length} رأسمالي، ${contractorsRegistry.maintenanceContractors.length} صيانة)`)
