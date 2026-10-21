// Each theme: background, surface (dock, settings), line, text, muted text, accent, done/connected, error.
// To add one: append a row; it appears in Settings automatically.
const KEYS=['bg','surface','line','text','muted','accent','ok','err'] as const;
export const THEMES:Record<string,{name:string;colors:string[]}>={
 lapis:{name:'Lapis & Brass',colors:['#0f1a2e','#17253d','#26385a','#eee5cf','#8e9ab3','#ddb463','#7cc4a6','#ec8f96']},
 'catppuccin-mocha':{name:'Catppuccin Mocha',colors:['#000000','#11111b','#313244','#cdd6f4','#a6adc8','#cba6f7','#a6e3a1','#f38ba8']},
 'catppuccin-latte':{name:'Catppuccin Latte',colors:['#eff1f5','#e6e9ef','#ccd0da','#4c4f69','#6c6f85','#8839ef','#40a02b','#d20f39']},
 dracula:{name:'Dracula',colors:['#282a36','#21222c','#44475a','#f8f8f2','#8b95c0','#bd93f9','#50fa7b','#ff5555']},
 nord:{name:'Nord',colors:['#2e3440','#3b4252','#4c566a','#eceff4','#9aa5b8','#88c0d0','#a3be8c','#bf616a']},
 'gruvbox-dark':{name:'Gruvbox Dark',colors:['#282828','#32302f','#504945','#ebdbb2','#a89984','#fabd2f','#b8bb26','#fb4934']},
 'gruvbox-light':{name:'Gruvbox Light',colors:['#fbf1c7','#f2e5bc','#d5c4a1','#3c3836','#7c6f64','#b57614','#79740e','#9d0006']},
 'tokyo-night':{name:'Tokyo Night',colors:['#1a1b26','#16161e','#292e42','#c0caf5','#9aa5ce','#7aa2f7','#9ece6a','#f7768e']},
 'one-dark':{name:'One Dark',colors:['#282c34','#21252b','#3e4451','#dcdfe4','#9da5b4','#61afef','#98c379','#e06c75']},
 'solarized-dark':{name:'Solarized Dark',colors:['#002b36','#073642','#0f4a57','#eee8d5','#93a1a1','#b58900','#859900','#dc322f']},
 'solarized-light':{name:'Solarized Light',colors:['#fdf6e3','#eee8d5','#d9d2bf','#073642','#657b83','#b58900','#859900','#dc322f']},
 'rose-pine':{name:'Rosé Pine',colors:['#191724','#1f1d2e','#403d52','#e0def4','#908caa','#ebbcba','#9ccfd8','#eb6f92']},
 everforest:{name:'Everforest',colors:['#2d353b','#343f44','#475258','#d3c6aa','#9da9a0','#dbbc7f','#a7c080','#e67e80']},
 kanagawa:{name:'Kanagawa',colors:['#1f1f28','#2a2a37','#363646','#dcd7ba','#a09f93','#7e9cd8','#98bb6c','#e46876']},
 monokai:{name:'Monokai',colors:['#272822','#1e1f1c','#49483e','#f8f8f2','#a59f85','#e6db74','#a6e22e','#f92672']},
 'github-dark':{name:'GitHub Dark',colors:['#0d1117','#161b22','#30363d','#e6edf3','#8d96a0','#58a6ff','#3fb950','#f85149']},
 'github-light':{name:'GitHub Light',colors:['#ffffff','#f6f8fa','#d0d7de','#1f2328','#59636e','#0969da','#1a7f37','#cf222e']},
};
// Catppuccin's accent colors; any of them can replace the accent of any theme.
export const ACCENTS:Record<string,string>={Rosewater:'#f5e0dc',Flamingo:'#f2cdcd',Pink:'#f5c2e7',Mauve:'#cba6f7',Red:'#f38ba8',Maroon:'#eba0ac',Peach:'#fab387',Yellow:'#f9e2af',Green:'#a6e3a1',Teal:'#94e2d5',Sky:'#89dceb',Sapphire:'#74c7ec',Blue:'#89b4fa',Lavender:'#b4befe'};
// Omarchy's colors.toml mapped onto the same eight slots.
export const fromOmarchy=(c:Record<string,string>)=>[c.background,c.dark_background||c.background,c.lighter_background||c.selection,c.foreground,c.dark_foreground||c.muted,c.accent,c.green,c.red];
export function applyTheme(id:string,accent='',omarchy?:Record<string,string>|null){
 const base=omarchy?.background?fromOmarchy(omarchy):(THEMES[id]||THEMES.lapis).colors,t={colors:base},root=document.documentElement;
 KEYS.forEach((k,i)=>root.style.setProperty('--'+k,k==='accent'&&accent?accent:t.colors[i]));
 // Light themes need light form controls and scrollbars.
 const light=parseInt(t.colors[0].slice(1,3),16)>128;root.style.colorScheme=light?'light':'dark';
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',t.colors[0]);
}
