import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const MANAGER_NAME_MAP = {
  'تركي الاسمري': 'تركي ظافر يحيى الاسمري',
  'تركي ظافر يحيى الاسمري': 'تركي ظافر يحيى الاسمري',
  'م. تركي الاسمري': 'تركي ظافر يحيى الاسمري',
  'عسكر لسلوم': 'عسكر لسلوم',
  'م. عسكر لسلوم': 'عسكر لسلوم',
  'عبدالله العنزي': 'عبدالله علي العنزي',
  'م. عبدالله العنزي': 'عبدالله علي العنزي',
  'عبدالله علي العنزي': 'عبدالله علي العنزي',
  'م / فهد العنزي': 'فهد العنزي',
  'م. فهد العنزي': 'فهد العنزي',
  'فهد العنزي': 'فهد العنزي',
  'سفر العتيبي': 'سفر العتيبي',
  'م. سفر العتيبي': 'سفر العتيبي',
  'علي الشهري': 'علي الشهري',
  'م. علي الشهري': 'علي الشهري',
  'أمجد الفالح': 'أمجد الفالح',
  'م. امجد الفالح': 'أمجد الفالح',
  'م. أمجد الفالح': 'أمجد الفالح',
  'عبدالله الأسود': 'عبدالله الأسود العنزي',
  'عبدالله الاسود': 'عبدالله الأسود العنزي',
  'عبدالله الأسود العنزي': 'عبدالله الأسود العنزي',
  'م. عبدالله الاسود': 'عبدالله الأسود العنزي',
  'علي القحطاني': 'علي القحطاني',
  'م/ علي القحطاني': 'علي القحطاني',
  'م. علي القحطاني': 'علي القحطاني',
  'شاكر الحقباني': 'شاكر الحقباني',
  'م. شاكر الحقباني': 'شاكر الحقباني',
  'سعيد الحارث': 'سعيد الحارث',
  'م.سعيد الحارث': 'سعيد الحارث',
  'م. سعيد الحارث': 'سعيد الحارث',
}

export function parseProjects() {
  const dir = path.join(__dirname, '../../../NWC_Projects')
  const projects = []

  // Read files synchronously for simplicity
  for (const file of fs.readdirSync(dir).filter(f => f.match(/^\d{2}_.*\.md$/))) {
    const filePath = path.join(dir, file)
    const content = fs.readFileSync(filePath, 'utf-8')

    // Extract YAML blocks
    const yamlRegex = /```yaml\s*([\s\S]*?)```/g
    let match
    while ((match = yamlRegex.exec(content)) !== null) {
      const yaml = match[1].trim()
      const project = {}

      // Parse YAML manually
      const lines = yaml.split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        const colonIdx = line.indexOf(':')
        if (colonIdx === -1) continue

        const key = line.substring(0, colonIdx).trim()
        let value = line.substring(colonIdx + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }

        if (key && value) {
          project[key] = value
        }
      }

      if (project.operation_number) {
        // Fallback manager for governorate projects where '-' was placed in cards
        let rawMgr = project.program_manager
        if (!rawMgr || rawMgr === '-') {
          if (project.sub_program?.includes('المحافظات الجنوبية')) {
            rawMgr = 'شاكر الحقباني'
          } else if (project.sub_program?.includes('المحافظات الغربية')) {
            rawMgr = 'سعيد الحارث'
          } else if (project.sub_program?.includes('المحافظات الشمالية')) {
            rawMgr = 'علي القحطاني'
          }
        }

        // Normalize manager name
        const normalizedMgr = MANAGER_NAME_MAP[rawMgr] || rawMgr || 'غير محدد'
        projects.push({
          id: project.id,
          operationNumber: project.operation_number,
          name: project.name,
          scope: project.scope,
          po: project.po,
          contractor: project.contractor,
          consultant: project.consultant,
          status: project.status, // جاري / مسلم ابتدائي / مسحوب
          subProgram: project.sub_program,
          executiveManager: project.executive_manager,
          execPhone: project.exec_phone,
          execEmail: project.exec_email,
          programManager: normalizedMgr,
          progPhone: project.prog_phone && project.prog_phone !== '-' ? project.prog_phone : (
            rawMgr === 'سعيد الحارث' ? '598991815' :
            rawMgr === 'شاكر الحقباني' ? '555022025' :
            rawMgr === 'فهد العنزي' || rawMgr === 'م / فهد العنزي' ? '555278400' :
            rawMgr === 'علي القحطاني' ? '555299813' : '-'
          ),
          progEmail: project.prog_email && project.prog_email !== '-' ? project.prog_email : (
            rawMgr === 'سعيد الحارث' ? 'salharth@nwc.com.sa' :
            rawMgr === 'شاكر الحقباني' ? 'talnoufal@nwc.com.sa' :
            rawMgr === 'فهد العنزي' || rawMgr === 'م / فهد العنزي' ? 'fhalenazi@nwc.com.sa' :
            rawMgr === 'علي القحطاني' ? 'aaalqahtani@nwc.com.sa' : '-'
          ),
          projectManager: project.project_manager,
          projPhone: project.proj_phone,
          projEmail: project.proj_email,
          residentEngineer: project.resident_engineer,
          resPhone: project.resident_phone,
          resEmail: project.resident_email,
        })
      }
    }
  }

  return projects
}
