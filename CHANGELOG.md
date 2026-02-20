# Changelog

## [0.1.0] (2026-02-20)

### Features

* add dynamic slash command discovery from SDK and user commands
* implement virtual scrolling for conversation rendering
* add audit logging for message history modifications
* **deploy**: add base paths support and service management improvements (#5)
* improve base paths autocomplete with recursive search (#4)
* add draft message persistence with cross-device sync (#3)
* add auto-reload mechanism for server binary updates
* add hapi-deploy Claude Code skill
* embed version info in all components (CLI, server, web)
* implement backend-driven /clear command
* add type-safe translation keys
* add YOLO toggle to fork and reload operations
* add UI for fork and reload session features
* enhance expandable composer with snap points and improved UX
* add expandable composer with drag and double-tap gestures
* add fork and reload session features (beta)
* implement universal resume functionality for all three CLIs
* add concurrency control to session resume
* implement session resume with spawn functionality
* rename restart to resume throughout the codebase
* improve restart session error messages
* add PWA force update controls to settings menu
* add version tracking with git SHA and build time
* add Linux deployment scripts with multi-instance support
* add /clear command to clear chat history in UI
* add toast notifications for bulk archive and restart operations
* add base paths management UI in settings
* add path autocomplete with configurable base paths
* add restart capability for inactive sessions
* add bulk archive for sessions in web app
* add support for Codex's request_user_input tool
* add microcompact_boundary event handling in web UI
* add --model parameter support to command handlers
* add model selection for AI agents (claude, codex, gemini)
* add image paste functionality to composer
* gemini local/remote mode
* improve ACP stability and UX with initialization retry and error handling
* redesign voice assistant icon with sound wave visualization
* expose skills and $ autocomplete (#92)
* **cli**: support HAPI_HOSTNAME env to override machine hostname (#94)
* add voice language selection in settings
* add settings page with language dropdown
* voice assistant
* add attachment support for Codex and Gemini agents
* add file upload support
* **web**: add turn-duration event display
* **web**: terminal quick keys + modifiers + long-press (#67)
* disable static file serving in relay mode
* add TLS certificate validation for tunnel access
* add wireguard relay integration for public server access with End-to-End Encryption
* add GitHub Actions workflow for @hapi mention auto-response
* add session resume capability via 'codex resume' command
* **web**: add fuzzy matching for slash commands (#63)
* add i18n support and enhance session UI (#50)
* add automated PR review workflow using Codex
* add automated issue response workflow using Codex
* **ui**: change session action menu UI style (#33)
* **terminal**: add Nerd Font support for Powerline themes (#29)
* add serverUrl configuration support with settings.json fallback
* add notification optimization with visibility tracking and toast messages
* add TELEGRAM_NOTIFICATION configuration switch
* add --host and --port CLI arguments to hapi server command. fix #37
* add MCP config and system prompt support for Codex local mode
* add api-error event support with folding for retry messages
* **terminal**: add quick input for control keys (#31)
* sync thinking state to session list view (#32)
* make session metadata updated_at timestamp optional
* add web push notifications support
* add session management (rename, archive, delete)
* auto-scroll selected suggestion into view
* add auto-start server feature for CLI
* add namespace-based multi-user isolation
* **web**: add sticky group headers to session list
* **web**: 优化会话列表展示 - 按目录分组并显示更新时间 (#22)
* auto-detect git worktree context from git commands
* implement message backfill to prevent message loss on reconnection
* add local session soft resume support for remote codex sessions
* unify app name
* new PWA icon
* add real-time permission and model mode synchronization close #21
* add listSlashCommands method to SyncEngine
* add directory autocomplete with validation for new session form
* add slash command autocomplete to HappyComposer
* add git worktree session support with improved UI
* add copy path button to file viewer
* add timeout and retry logic to bun install in release script
* create new session with yolo mode (#13)
* add intelligent session matching based on cwd and timestamp
* **server**: add Dockerfile + CI docker build/push (#10)
* implement unified local launch failure handling policy
* handle thinking blocks as reasoning blocks in chat normalization
* add reasoning block support to chat system
* implement web terminal feature with xterm.js and Socket.IO proxy
* add configurable server URL for standalone web hosting
* add pre-checks to release-all script for safety
* implement server configuration persistence to ~/.hapi/settings.json
* add Homebrew installation support for hapi CLI
* add support for user message events from Codex
* add Spinner and LoadingState components for unified loading UX
* add npx/bunx binary distribution support
* add syncing banner and smart scroll behavior for chat thread
* add automatic CLI_API_TOKEN generation for the server
* add session cleanup script with flexible filtering options
* add token-based authentication to session hooks
* implement session tracking via Claude hooks
* **web**: add continue hint in HappyComposer when switching to remote mode
* **codex**: implement CLI argument passthrough for codex
* **web**: improve token refresh handling with automatic 401 retry and focus-based refresh
* **web**: add auto-focus to composer input on desktop devices only
* improve codex permission elicitation with parameter extraction and reason support
* make Telegram optional and unify user authentication with owner ID
* add switch to remote button for local mode
* **web**: separate pending permissions from task details in tool messages
* add source file execution and fix function name reference
* **cli**: add Agent Client Protocol (ACP) integration for external agent support
* **web**: add CLI output message block support with layout improvements
* **cli**: add single executable with embedded web assets support
* **cli**: refactor embedded assets with Bun-specific and stub implementations
* **web**: enable scroll restoration in TanStack Router
* add git integration with file browsing and diff viewing
* **cli**: add Bun single executable binary support
* **web**: improve AskUserQuestion tool card UX with better answers visualization
* **web**: integrate TanStack React Router for client-side routing
* **cli**: add Bun compiled binary runtime asset management
* **cli**: add Bun runtime support for ripgrep and CLI spawning
* **web**: integrate TanStack Query for state management
* **server**: add Hono logger middleware for API request logging
* **web**: optimize rendering with chat block reconciliation and component memoization
* add Vite dev server proxy configuration for local development
* implement AskUserQuestion tool with interactive UI and question flow
* **web**: implement conditional Telegram SDK loading
* optimize PWA service worker update strategy for better caching
* optimize web bundle with custom minimal Shiki highlighter
* add iOS Safari install guide and improve PWA UX with neutral theme
* implement progressive web app support with offline capabilities
* add web vibration api fallback for haptic feedback
* add browser environment support with access token authentication
* improve event presentation with separate icons and add aria labels to buttons
* add model-aware context budget calculation for status bar warnings
* improve settings overlay and tool message display
* integrate @assistant-ui/react library with new chat components
* add viewport height tracking and improve scroll behavior on mobile
* add iOS platform detection and improve dark theme contrast
* add support for multiple special words in rainbow text effect
* add rainbow sparkle text effect for ultrathink in user messages
* add todo tracking and custom tool views
* Add online status display and context usage tracking to ChatInput
* refactor ChatInput with autocomplete, suggestion management, and settings integration
* add permission decision options, tool allowlisting, and refactored chat UI components
* add interactive CLI token configuration with settings persistence

### Bug Fixes

* use Type=simple with start-sync for runner systemd service
* filter TUI-only slash commands from remote mode autocomplete
* allow same-origin Socket.IO requests when accessed via reverse proxy
* deduplicate SDK slash commands reported at multiple scopes
* restore session metadata and slash command visibility
* unset CLAUDECODE env var when spawning SDK metadata extraction
* address virtual scrolling review findings
* initialize virtualizer scroll element via effect
* correct virtual scrolling spacing calculation
* increase PWA cache size limit to 3MB
* clear agentState on message history modifications
* **deploy**: use Restart=always for server service
* correct auth context access and session lookup methods
* properly escape PS1 backslashes for systemd
* escape dollar sign in PS1 for systemd
* add shell environment variables to systemd services
* composer buttons stick to bottom and textarea scrolls when expanded
* exclude version.generated.ts from git tracking
* embed version info at compile time using generated TypeScript
* improve /clear command UX by not showing it optimistically
* add missing dialog.resume.sessionNotFound translation key
* use import.meta.dir for version.json path resolution
* resolve all 14 web package type errors
* rename test file to .tsx for JSX support
* add resumeSessionId parameter support to geminiLocal
* resolve three type errors
* add missing translations for fork and reload actions
* remove incomplete message queue implementation
* resolve session resume parameter mismatch and silent error handling
* resolve session resume duplicate creation bug
* enable hot reload during reinstall by using atomic mv
* correct version.json import path in version route
* use HAPI_LISTEN_PORT environment variable and check correct binary path
* use useAppContext instead of non-existent useApi hook
* **critical**: sort chat blocks chronologically to fix rendering bug
* improve error handling with specific HTTP status codes for restart
* add loading states and accessibility to bulk archive UI
* add user-visible error messages and retry for bulk archive
* replace Promise.all with Promise.allSettled in bulk archive
* **security**: add confirmation dialog for bulk archive operations
* add restartSession RPC handler with not-implemented error
* **security**: add path validation to prevent filesystem enumeration
* handle option highlighting in request_user_input component
* prevent Gemini orphan processes when switching modes
* prevent model parameter from being set to arbitrary strings (#93)
* reposition ReactQueryDevtools button to middle-right
* properly clean up voice session resources on disconnect
* add postinstall script to set bin/hapi.cjs executable permission (#78)
* escape newlines in shell arguments on Windows
* use --add-dir flag for granting Claude read access to uploads
* send session-alive signal immediately on socket connect to prevent initial offline flicker
* set default TUNWG_PATH and support ~ in HAPI_HOME
* require runtime assets for server command
* use baseUrl for Socket.IO connection to support separate frontend hosting
* typecheck
* enable GitHub Pages SPA routing by copying index.html to 404.html
* prevent auto-resume of old Codex sessions from before startup
* use message field for Codex permission card subtitle
* implement permission handler callbacks and add CodexPermission UI support
* add shell_command tool to knownTools registry
* parse codex bash output format in web app display
* position session action menu at touch/click point
* use worktree grouping for homepage project count
* suppress git stderr when running in non-git directory
* enable shell option for Windows process spawning in ACP transport
* prevent click navigation after long press on session list (#52)
* add retry logic to daemon machine registration for transient connection errors
* start codex on Windows by using shell; keep mcp args parseable (#40)
* prevent continuous "Load More" triggering in message virtualization
* **website**: use @twsxtd/hapi instead of deprecated hapi package (#34)
* correct npm repository URL format in cli package
* docker build
* **store**: handle version 0 with existing tables gracefully
* allow dismissing PWA install prompt in Chrome/Edge
* use relative path for PWA push notification URL
* archive session
* docker build
* expand codex custom prompt
* correct diff/file toggle button styling in dark mode
* handle back navigation from single file view to files list
* update documentation routing and simplify navigation
* ensure workspace dependencies are installed via bun workspaces
* improve namespace-based multi-user
* prevent race condition in MessageQueue2 wait logic
* pass through all permission modes in claudeRemote
* update slash command descriptions for claude, codex, and gemini. close #20
* correct UTF-8 encoding in base64 decode for file paths fix #20
* capture process PID in local variable for TypeScript control flow
* resolve TypeScript type inference issue in claudeLocal.ts
* improve cross-platform compatibility for path and file operations
* codex session selection
* add padding to terminal container
* we need bun 1.3.5 becuase of the Terminal feature. close #15
* extend ink Key type with runtime properties
* terminal state restoration and abort handling regression
* use timing-safe comparison for CLI API token validation (#9)
* disable autoload dotenv (#11)
* persist CLI_API_TOKEN from env var to settings when not already saved
* use Bun.main to detect compiled binary instead of Bun.isCompiled (#4)
* improve message counter initialization with bootstrap check
* use .cjs extension for bin script to fix ES module compatibility
* prevent flash of white background in dark mode
* improve "Load older" button styling and alignment
* prevent LoginPrompt flash on page refresh with stored token
* handle abort signal before and during codex spawn
* constrain session disabled banner width to max-w-content
* navigate to parent path generically in useAppGoBack instead of hardcoded /sessions
* add 300ms debounce to sync banner display
* prevent sync banner from flashing on session switches
* add friendly error messages for failed binary spawning
* **web**: enable auto-scroll and add key prop to HappyThread component
* **cli**: resolve path alias with bun link using bunfig.toml configuration
* **cli**: improve error message categorization for better UX
* **web**: handle null values in permissionMode and modelMode using nullish coalescing
* **cli**: add stub embedded assets generation to build process
* **web**: fix navigation in session creation flow with back buttons
* **web**: remove streaming dot indicator from markdown component
* **web**: handle codex content type in message normalization
* add type safety improvements and fix Bun runtime type issues
* **web**: add safe-area-inset-top padding to prevent statusbar overlap on iOS PWA
* **web**: prevent text overflow in user message component by adding min-w-0 constraint
* improve error handling in git operations and queries
* **web**: suppress focus ring on pointer interactions while preserving keyboard accessibility
* **web**: render system messages without MessagePrimitive.Root
* **web**: align SessionHeader content with centered layout
* **web**: restore dark mode styling broken by conditional Telegram SDK loading
* **web**: prevent Android Chrome keyboard overlap
* remove unreliable Telegram environment detection to fix loading delay
* integrate History API for browser back button navigation
* change retry button text from Chinese to English
* wrap system message content in text object structure for @assistant-ui/react compatibility
* handle underscores in project path generation
* increase ChatInput padding to match happy-app spacing
* add iOS safe area bottom padding to ChatInput to prevent Home Indicator overlap

### Miscellaneous Changes

* add temp/ to gitignore
* remove unfinished upstream sync workflow
* add .worktrees to gitignore
* allow setting the backend server in dev
* use self mention
* improve issue auto-response workflow triggers and concurrency handling
* allow all users for Codex workflow actions
* update agents.md
* rename PWA to App
* allow bots
* optimize issue auto-response prompt structure and guidelines
* fix codex issue/pr respond
* fix gh command in workflow
* **codex**: log MCP wrapper event types
* migrate to AGPL-3.0-only
* disable blank issues
* Add github issue template
* add LGPL-3.0-or-later license and update package.json licenses
* allow release dry-run without npm login
* remove unused
* prepare release 0.1.0 with native binary support
* run tools:unpack before tests
* setup integration test environment in CI workflow
* add GitHub Actions CI/CD workflows
* remove Windows ARM64 build support and add npm publish scripts
* add module declaration for web asset imports
* migrate cli distribution from npm to bun executable
* remove unused test fixtures and disable dead test case
* Add Contiamo CI flow (#13)
* remove Codex workflows and prompts
* add GitHub Pages deployment workflow for web app
* restrict Docker workflow to release tags and manual dispatch

### Documentation

* add local dev guide to CLAUDE.md and commit dev-test script
* add message queue implementation planning documents
* add root CLAUDE.md and reorganize project documentation
* add expandable composer implementation proposal
* create session ID architecture diagram and guide
* add comprehensive JSDoc for session ID duality
* add background service deployment section with nohup, pm2, launchd, and systemd examples
* add Architecture section explaining HAPI components and workflows
* update installation guide and fix environment variable references (#85)
* add voice assistant documentation
* README
* default to --relay for simplified remote access with E2EE
* fix documentation links to work on GitHub and VitePress
* update Quick Start section to use npx and simplify steps
* rewrite Features section from pain-point perspective
* add push notifications documentation
* update
* dynamically fetch latest version from GitHub API
* add Seamless Handoff documentation and showcase
* simplify Getting Started section for 30-second onboarding
* clarify HAPI supports single user and small teams via namespaces
* clarify server deployment options and remote access methods
* add Steps component and refactor quick-start guide
* improve quick-start guide with next steps section
* add documentation site with VitePress setup
* update build command (#14)
* add macOS quarantine fix and Access Token guide (#5)
* update Gemini default args to experimental-acp
* add architectural comparison with Happy and update README
* recommend npx @twsxtd/hapi as primary installation method
* rewrite daemon README with current codebase state
* update all README files with comprehensive documentation
* rebrand Happy to HAPI and add component documentation

### Code Refactoring

* drop redundant user command scan for Claude, rename source 'sdk' to 'claude'
* consolidate permission handler auto-approval logic into base class
* consolidate hook settings generation into shared common module
* remove passthrough() from zod schemas and make validation explicit
* move attachment metadata schema to shared protocol package
* migrate socket types and payloads to shared protocol package
* consolidate utility functions into shared package
* rename configuration variables for clarity
* rename daemon to runner throughout codebase
* extract isBunCompiled to separate utils module
* extract and reuse CORS options for Socket.IO and Engine
* use useNavigate for URL parameter cleanup in AppInner
* track visible pending messages separately from total count
* replace React Query message cache with windowed message store
* move Server button into help links section below login form
* improve LoginPrompt UI/UX with simplified layout and better navigation
* decompose Store into domain-specific substore classes
* unify MCP bridge setup and system prompt delivery
* split CLI handlers into modular handler files
* extract permission handler base class for code reuse
* extract remote launcher base class for code reuse
* extract session scanner base class for code reuse
* consolidate configuration files into dedicated config module
* move path utilities to utils directory
* remove CLI dead code
* remove unused/deprecated code and legacy socket events
* extract session summary utilities to shared module
* modularize store implementation into domain-specific modules
* remove deprecated logout command and legacy sidechain logic
* replace hardcoded permission/model modes with centralized schema validation
* extract session lifecycle management and mode switching to shared module
* extract chat normalization and reducer logic, cleanup legacy credentials
* extract permission mode utilities and consolidate styling logic
* **api**: extract versioned update handling to shared utility
* extract message utilities to shared module
* **cli**: split command routing and modularize RPC handlers
* **sync**: split SyncEngine into modular services
* **store**: introduce schema versioning and remove compatibility migrations
* **cli**: unify session bootstrap
* restructure notification system with NotificationHub abstraction
* Add Telegram binding storage and auth
* remove unused onboardingCompleted field from Settings
* replace specific character regex with comprehensive non-alphanumeric pattern
* remove unnecessary getCleanEnv() function
* use undefined instead of null for optional return type
* consolidate copy-to-clipboard logic and icons
* extract MCP config handling to use temp files on Windows
* simplify yolo mode implementation by removing env vars
* extract CLI argument parsing into shared utility
* extract spawn abort handling into shared utility
* use ref objects for session tracking in closures
* extract process management utilities for cross-platform support
* safely access Bun.main with optional chaining
* unify bun compiled detection with windows support
* update dependencies including zod, vitest, and type packages
* upgrade to Tailwind CSS v4 and update dependencies
* update dependencies and fix TypeScript instantiation depth issues
* remove eslint and tsx-related dependencies after bun migration
* migrate from tsx to bun as TypeScript runtime
* simplify connection indicator component with inline styling
* move directory creation before lock file operations. fix #6
* adjust safe area padding for Safari browser
* optimize safe area handling in web components
* move web asset module declarations to dedicated types file
* unify release workflow into single release-all script
* rename HAPI_BOT_URL to HAPI_SERVER_URL
* rename normalizedMessagesCount to renderedMessagesCount for clarity
* remove non-allinone build scripts and fix npm publish build command
* **telegram**: remove interactive features and simplify to notifications only
* **telegram**: simplify notifications and remove emoji
* **test**: simplify keyboard input handling and extract type definitions
* remove custom executable support and simplify Claude CLI resolution
* remove client-side session ID management
* **test**: migrate useSwitchControls test from react-test-renderer to ink render
* **codex**: extract config building and support CLI overrides in remote mode
* **web**: unify max-width constraints with tailwind content class
* migrate unpack-tools script from CommonJS to TypeScript
* remove CommonJS ripgrep launcher and spawn binary directly
* **web**: simplify NewSession component layout with divided sections
* **web**: redesign SessionList component with enhanced session metadata
* **daemon**: use mtime-based version detection instead of string comparison
* remove CommonJS launchers and use claude command directly
* remove thinking state tracking from local launcher
* **ui**: extract switch controls logic into reusable hook and terminal restoration utility
* extract session and loop logic into reusable agent base classes
* **web**: move message loading header into HappyThread with infinite scroll
* **web**: unify session creation into single page with path history
* **codex**: extract session management and launcher logic into separate modules
* unify runtime directories and environment variables to HAPI_HOME
* **web**: enhance DiffView with modal preview and inline variant
* replace react-syntax-highlighter with react-shiki
* replace react-syntax-highlighter with react-shiki
* extract presentation utilities and status indicator component
* remove deprecated chat components in favor of @assistant-ui/react
* remove dead code components from web/src/components
* remove macOS caffeinate sleep prevention functionality
* simplify session component headers and add Telegram Web App support
* use GenericResultView for mcp tools instead of MarkdownResultView
* extract tool result views into dedicated registry pattern
* remove border styling and improve component styling
* simplify permission footer display and remove unused accent border styling
* improve message synchronization with sequence-based pagination and merging

All notable changes to this project will be documented in this file.

