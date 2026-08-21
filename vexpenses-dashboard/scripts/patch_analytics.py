#!/usr/bin/env python3
# Apply Power BI changes to analytics page
with open('app/analytics/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

changes = [
    # 1. Add Badge import
    (
        "import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';\nimport { Button } from '@/components/ui/button';\nimport { Input } from '@/components/ui/input';",
        "import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';\nimport { Button } from '@/components/ui/button';\nimport { Input } from '@/components/ui/input';\nimport { Badge } from '@/components/ui/badge';"
    ),
    # 2. Add Building2 to lucide imports
    (
        "  XCircle,\n  Users\n} from 'lucide-react';",
        "  XCircle,\n  Users,\n  Building2\n} from 'lucide-react';"
    ),
    # 3. Add new state variables after showFilters
    (
        "  const [showFilters, setShowFilters] = useState(false);",
        "  const [showFilters, setShowFilters] = useState(false);\n  const [cardFilter, setCardFilter] = useState('all');\n  const [yearFilter, setYearFilter] = useState('all');\n  const [regionalFilter, setRegionalFilter] = useState('all');\n  const [approverFilter, setApproverFilter] = useState('all');\n  const [reportFilter, setReportFilter] = useState('all');"
    ),
    # 4. Add error tracking to reports query
    (
        "  const { data: reports = [], isLoading } = useStatusCaixa({",
        "  const { data: reports = [], isLoading, error: reportsError } = useStatusCaixa({"
    ),
    # 8. Update resetFilters
    (
        "  const resetFilters = () => {\n    setSearchTerm('');\n    setDateFilter('month');\n    setCostCenterFilter('all');\n    setUserFilter('all');\n  };",
        "  const resetFilters = () => {\n    setSearchTerm('');\n    setDateFilter('month');\n    setCostCenterFilter('all');\n    setUserFilter('all');\n    setCardFilter('all');\n    setYearFilter('all');\n    setRegionalFilter('all');\n    setApproverFilter('all');\n    setReportFilter('all');\n  };"
    ),
    # 7. Update dependency arrays
    (
        "  }, [reports, searchTerm, costCenterFilter, userFilter, dateFilter, teamMembers]);",
        "  }, [reports, searchTerm, costCenterFilter, userFilter, dateFilter, teamMembers, expenses, cardFilter, yearFilter, regionalFilter, approverFilter, reportFilter]);"
    ),
]

for old, new in changes:
    if old in content:
        content = content.replace(old, new)
        print(f'Applied change: {old[:50]}...')
    else:
        print(f'WARNING - not found: {old[:50]}...')

with open('app/analytics/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'Done! Lines: {len(content.splitlines())}')
