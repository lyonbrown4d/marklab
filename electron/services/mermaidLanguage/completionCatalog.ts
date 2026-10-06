import { CompletionItemKind } from 'vscode-languageserver-types'

import type { MermaidDiagramKind } from '@electron/services/mermaidLanguage/types'

export type MermaidCompletionTemplate = {
  label: string
  detail: string
  newText: string
  kind?: CompletionItemKind
}

const template = (
  label: string,
  detail: string,
  newText: string,
  kind: CompletionItemKind = CompletionItemKind.Snippet,
): MermaidCompletionTemplate => ({ detail, kind, label, newText })

export const diagramDeclarations: readonly MermaidCompletionTemplate[] = [
  template(
    'flowchart diagram',
    'Create a directed flowchart',
    'flowchart ${1:TD}\n  ${0}',
    CompletionItemKind.Module,
  ),
  template(
    'sequence diagram',
    'Create a sequence diagram',
    'sequenceDiagram\n  ${0}',
    CompletionItemKind.Module,
  ),
  template(
    'class diagram',
    'Create a class diagram',
    'classDiagram\n  ${0}',
    CompletionItemKind.Module,
  ),
  template(
    'state diagram',
    'Create a state diagram',
    'stateDiagram-v2\n  ${0}',
    CompletionItemKind.Module,
  ),
  template(
    'ER diagram',
    'Create an entity relationship diagram',
    'erDiagram\n  ${0}',
    CompletionItemKind.Module,
  ),
  template('Gantt chart', 'Create a Gantt chart', 'gantt\n  ${0}', CompletionItemKind.Module),
  template(
    'mindmap',
    'Create a mindmap',
    'mindmap\n  root((${1:Topic}))\n    ${0}',
    CompletionItemKind.Module,
  ),
  template('timeline', 'Create a timeline', 'timeline\n  ${0}', CompletionItemKind.Module),
]

const flowchartStatements = [
  template('node', 'Add a flowchart node', '${1:id}[${2:Label}]'),
  template('edge', 'Connect two flowchart nodes', '${1:A} --> ${2:B}'),
  template('subgraph', 'Group flowchart nodes', 'subgraph ${1:name}\n  ${0}\nend'),
  template('direction', 'Set the flow direction', 'direction ${1|TB,TD,BT,RL,LR|}'),
  template('click', 'Attach a link to a node', 'click ${1:id} "${2:https://example.com}"'),
  template(
    'class definition',
    'Define a reusable node style',
    'classDef ${1:name} ${2:fill:#fff,stroke:#333}',
  ),
]

const sequenceStatements = [
  template('participant', 'Declare a participant', 'participant ${1:Alice} as ${2:Alice}'),
  template('actor', 'Declare an actor', 'actor ${1:User} as ${2:User}'),
  template('message', 'Send a synchronous message', '${1:Alice}->>${2:Bob}: ${3:Message}'),
  template('reply', 'Send a dotted reply', '${1:Bob}-->>${2:Alice}: ${3:Reply}'),
  template('note', 'Add a note over participants', 'Note over ${1:Alice},${2:Bob}: ${3:Note}'),
  template(
    'alt block',
    'Add an alternative flow',
    'alt ${1:condition}\n  ${0}\nelse ${2:otherwise}\nend',
  ),
  template('optional block', 'Add an optional flow', 'opt ${1:condition}\n  ${0}\nend'),
  template('loop block', 'Add a repeated flow', 'loop ${1:description}\n  ${0}\nend'),
  template(
    'parallel block',
    'Add parallel flows',
    'par ${1:action}\n  ${0}\nand ${2:other action}\nend',
  ),
]

const classStatements = [
  template('class', 'Declare a class with members', 'class ${1:ClassName} {\n  ${0}\n}'),
  template('inheritance', 'Add an inheritance relationship', '${1:Base} <|-- ${2:Derived}'),
  template(
    'association',
    'Add an association relationship',
    '${1:ClassA} --> ${2:ClassB} : ${3:label}',
  ),
  template('composition', 'Add a composition relationship', '${1:Whole} *-- ${2:Part}'),
  template('annotation', 'Add a class annotation', '<<${1:interface}>> ${2:ClassName}'),
  template('namespace', 'Group classes in a namespace', 'namespace ${1:name} {\n  ${0}\n}'),
]

export const classMemberStatements: readonly MermaidCompletionTemplate[] = [
  template('public method', 'Add a public method', '+${1:method}(${2}) ${3:void}'),
  template('private field', 'Add a private field', '-${1:field} ${2:string}'),
  template('abstract method', 'Add an abstract method', '+${1:method}(${2})* ${3:void}'),
  template('static method', 'Add a static method', '+${1:method}(${2})$ ${3:void}'),
]

const stateStatements = [
  template('state', 'Declare a state', 'state "${1:Label}" as ${2:State}'),
  template('transition', 'Add a state transition', '${1:StateA} --> ${2:StateB} : ${3:event}'),
  template('start transition', 'Connect the start pseudo-state', '[*] --> ${1:State}'),
  template('end transition', 'Connect the end pseudo-state', '${1:State} --> [*]'),
  template('composite state', 'Declare a composite state', 'state ${1:State} {\n  ${0}\n}'),
  template('choice', 'Declare a choice pseudo-state', 'state ${1:choice} <<choice>>'),
  template('note', 'Add a note to a state', 'note right of ${1:State}\n  ${0}\nend note'),
]

const erStatements = [
  template('entity', 'Declare an entity', '${1:ENTITY} {\n  ${2:string} ${3:id} PK\n  ${0}\n}'),
  template(
    'relationship',
    'Declare an entity relationship',
    '${1:CUSTOMER} ||--o{ ${2:ORDER} : "${3:places}"',
  ),
]

export const erAttributeStatements: readonly MermaidCompletionTemplate[] = [
  template('primary key attribute', 'Add a primary key attribute', '${1:string} ${2:id} PK'),
  template('attribute', 'Add an entity attribute', '${1:string} ${2:name}'),
  template('foreign key attribute', 'Add a foreign key attribute', '${1:int} ${2:owner_id} FK'),
]

const ganttStatements = [
  template('title', 'Set the chart title', 'title ${1:Project plan}'),
  template('date format', 'Set the input date format', 'dateFormat ${1:YYYY-MM-DD}'),
  template('axis format', 'Set the displayed date format', 'axisFormat ${1:%m/%d}'),
  template('section', 'Create a task section', 'section ${1:Section}'),
  template(
    'task',
    'Add a task',
    '${1:Task name} :${2:active}, ${3:task-id}, ${4:2026-01-01}, ${5:3d}',
  ),
  template(
    'milestone',
    'Add a milestone',
    '${1:Milestone} :milestone, ${2:id}, ${3:2026-01-01}, 0d',
  ),
]

const mindmapStatements = [
  template('root node', 'Add the central topic', 'root((${1:Topic}))\n  ${0}'),
  template('branch', 'Add a child topic', '${1:Topic}\n  ${0}'),
  template('rounded node', 'Add a rounded topic', '${1:id}(${2:Topic})'),
  template('cloud node', 'Add a cloud topic', '${1:id})${2:Topic}('),
  template('icon', 'Attach an icon class', '::icon(${1:fa fa-book})'),
]

const timelineStatements = [
  template('title', 'Set the timeline title', 'title ${1:Timeline}'),
  template('section', 'Create a timeline section', 'section ${1:Period}'),
  template('event', 'Add a dated event', '${1:2026} : ${2:Event}'),
]

export const statementCatalog: Readonly<
  Record<MermaidDiagramKind, readonly MermaidCompletionTemplate[]>
> = {
  class: classStatements,
  er: erStatements,
  flowchart: flowchartStatements,
  gantt: ganttStatements,
  mindmap: mindmapStatements,
  sequence: sequenceStatements,
  state: stateStatements,
  timeline: timelineStatements,
}
