import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarTrigger,
} from '@/components/ui/menubar'

type MenuItem = {
  id: string
  label: string
}

type MenuGroup = {
  label: string
  items: MenuItem[]
}

type AppMenuBarProps = {
  groups: MenuGroup[]
  onAction: (id: string) => void
}

const AppMenuBar = ({ groups, onAction }: AppMenuBarProps) => {
  return (
    <Menubar className="menu-bar-surface ml-2 hidden h-7 items-center gap-0.5 p-0 lg:flex">
      {groups.map((group) => (
        <MenubarMenu key={group.label}>
          <MenubarTrigger className="h-7 rounded-md px-2 text-xs font-normal text-muted-foreground hover:cursor-pointer hover:bg-accent/75 hover:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground">
            {group.label}
          </MenubarTrigger>
          <MenubarContent align="start" className="min-w-40">
            {group.items.map((item) => (
              <MenubarItem key={item.id} onSelect={() => onAction(item.id)}>
                {item.label}
              </MenubarItem>
            ))}
          </MenubarContent>
        </MenubarMenu>
      ))}
    </Menubar>
  )
}

export default AppMenuBar
