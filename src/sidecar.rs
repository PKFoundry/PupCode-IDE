use std::io::BufRead;
use std::path::PathBuf;
use std::process::{Child, Command as StdCommand, Output, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use rand::Rng;
use tokio::time::sleep;

type LineCallback = Arc<Mutex<Option<Arc<dyn Fn(String) + Send + Sync>>>>;

// ---------------------------------------------------------------------------
// Structured error types for the frontend
// ---------------------------------------------------------------------------

/// Errors that can occur when starting the Python sidecar.
/// The `message()` method returns a user-friendly string.
pub enum SidecarError {
    /// Python 3.13+ was not found on the system.
    PythonNotFound { found_version: Option<String> },
    /// Python was found but code-puppy or another dependency is missing.
    DependencyMissing { package: String, python_path: String },
    /// Failed to spawn the Python process.
    SpawnFailed { reason: String },
    /// The sidecar started but health check failed.
    HealthCheckFailed { port: u32 },
}

impl SidecarError {
    pub fn message(&self) -> String {
        match self {
            SidecarError::PythonNotFound { found_version } => {
                if let Some(v) = found_version {
                    format!(
                        "Python {} found, but Python 3.13+ is required.\n\
                         Please install Python 3.13 or later from https://www.python.org/downloads/",
                        v
                    )
                } else {
                    "Python 3.13+ is required but was not found.\n\
                     Please install it from https://www.python.org/downloads/".to_string()
                }
            }
            SidecarError::DependencyMissing { package, python_path } => {
                format!(
                    "Package '{}' is not installed in Python at {}.\n\
                     Run: {} -m pip install {}",
                    package,
                    python_path,
                    python_path,
                    package
                )
            }
            SidecarError::SpawnFailed { reason } => {
                format!("Failed to start sidecar: {}", reason)
            }
            SidecarError::HealthCheckFailed { port } => {
                format!(
                    "Sidecar started on port {} but did not respond.\n\
                     Check the console logs for errors.",
                    port
                )
            }
        }
    }
}

impl std::fmt::Display for SidecarError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message())
    }
}

// ---------------------------------------------------------------------------
// SidecarManager
// ---------------------------------------------------------------------------

/// Manages the Python sidecar process lifecycle.
///
/// Discovers system Python 3.13+, verifies code-puppy is installed,
/// then spawns `python -Xutf8 sidecar_main.py` as a child process.
///
/// On Windows, uses a Job Object to ensure the entire process tree
/// is killed when the parent exits. On Unix, uses process groups.
pub struct SidecarManager {
    process: Mutex<Option<Child>>,
    port: Mutex<u32>,
    auth_token: Mutex<String>,
    stdout_callback: LineCallback,
    stderr_callback: LineCallback,
}

impl SidecarManager {
    pub fn new() -> Self {
        Self {
            process: Mutex::new(None),
            port: Mutex::new(0),
            auth_token: Mutex::new(String::new()),
            stdout_callback: Arc::new(Mutex::new(None)),
            stderr_callback: Arc::new(Mutex::new(None)),
        }
    }

    pub fn on_stdout<F>(&self, f: F)
    where
        F: Fn(String) + Send + Sync + 'static,
    {
        *self.stdout_callback.lock().unwrap() = Some(Arc::new(f));
    }

    pub fn on_stderr<F>(&self, f: F)
    where
        F: Fn(String) + Send + Sync + 'static,
    {
        *self.stderr_callback.lock().unwrap() = Some(Arc::new(f));
    }

    /// Start the Python sidecar process.
    ///
    /// Discovers system Python 3.13+, verifies code-puppy is installed,
    /// then spawns `python -Xutf8 sidecar_main.py`.
    pub async fn start(&self, working_dir: &str) -> Result<u32, SidecarError> {
        self.stop().await;

        // Generate a random 256-bit hex auth token for this sidecar instance
        let auth_token = {
            let mut rng = rand::thread_rng();
            (0..32)
                .map(|_| {
                    let byte = rng.gen::<u8>();
                    format!("{:02x}", byte)
                })
                .collect::<String>()
        };
        *self.auth_token.lock().unwrap() = auth_token;

        let python = find_python().map_err(|e| {
            println!("[sidecar] python discovery failed: {}", e);
            e
        })?;
        verify_dependencies(&python).map_err(|e| {
            println!("[sidecar] dependency check failed: {}", e);
            e
        })?;
        let port = self.spawn_sidecar(&python, working_dir)?;

        *self.port.lock().unwrap() = port;
        poll_health(port).await.map_err(|_| SidecarError::HealthCheckFailed { port })?;
        Ok(port)
    }

    /// Get the current auth token for sidecar communication.
    pub fn get_auth_token(&self) -> String {
        self.auth_token.lock().unwrap().clone()
    }

    /// Stop the sidecar process and its entire process tree.
    pub async fn stop(&self) {
        let mut process_guard = self.process.lock().unwrap();
        if let Some(mut child) = process_guard.take() {
            kill_process_tree(&mut child);
            let _ = child.wait();
        }
        *self.port.lock().unwrap() = 0;
    }

    pub fn get_port(&self) -> u32 {
        *self.port.lock().unwrap()
    }

    fn spawn_sidecar(
        &self,
        python_path: &PathBuf,
        working_dir: &str,
    ) -> Result<u32, SidecarError> {
        let script_path = sidecar_script_path();

        if !script_path.exists() {
            return Err(SidecarError::SpawnFailed {
                reason: format!(
                    "Sidecar script not found at: {}",
                    script_path.display()
                ),
            });
        }

        let port = find_free_port().map_err(|e| SidecarError::SpawnFailed {
            reason: format!("Failed to find free port: {}", e),
        })?;

        println!(
            "[sidecar] spawning: {} {} on port {}",
            python_path.display(),
            script_path.display(),
            port
        );
        println!("[sidecar] working dir: {}", working_dir);

        let script_dir = script_path
            .parent()
            .unwrap_or(std::path::Path::new("."));

        let mut cmd = StdCommand::new(python_path);
        let auth_token = self.auth_token.lock().unwrap().clone();
        cmd.arg("-Xutf8")
            .arg(&script_path)
            .env("SIDECAR_PORT", port.to_string())
            .env("SIDECAR_WORKING_DIR", working_dir)
            .env("SIDECAR_AUTH_TOKEN", auth_token)
            .env("PYTHONIOENCODING", "utf-8")
            // Ensure file_watcher.py is importable from the script's directory
            .env("PYTHONPATH", script_dir)
            .current_dir(script_dir);

        // Hide console window on Windows
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        // Unix: spawn in a new process group for clean tree killing
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            unsafe {
                cmd.pre_exec(|| {
                    libc::setsid();
                    Ok(())
                });
            }
        }

        let mut child = cmd
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| SidecarError::SpawnFailed {
                reason: format!("Failed to spawn python: {}", e),
            })?;

        // Windows: assign child to a Job Object that kills the entire
        // process tree when the parent (Tauri) exits.
        #[cfg(windows)]
        {
            let pid = child.id() as u32;
            if let Err(e) = windows_assign_to_job(pid) {
                eprintln!("[sidecar] warning: could not assign to job object: {}", e);
            }
        }

        // Stream stdout
        if let Some(stdout) = child.stdout.take() {
            let callback = Arc::clone(&self.stdout_callback);
            std::thread::spawn(move || {
                let reader = std::io::BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        if let Some(ref cb) = *callback.lock().unwrap() {
                            cb(line);
                        }
                    }
                }
            });
        }

        // Stream stderr
        if let Some(stderr) = child.stderr.take() {
            let callback = Arc::clone(&self.stderr_callback);
            std::thread::spawn(move || {
                let reader = std::io::BufReader::new(stderr);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        if let Some(ref cb) = *callback.lock().unwrap() {
                            cb(line);
                        }
                    }
                }
            });
        }

        *self.process.lock().unwrap() = Some(child);
        Ok(port)
    }
}

impl Drop for SidecarManager {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.process.lock() {
            if let Some(mut child) = guard.take() {
                kill_process_tree(&mut child);
                let _ = child.wait();
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Python Discovery
// ---------------------------------------------------------------------------

/// Find a suitable Python 3.13+ executable on the system.
///
/// Search order varies by platform:
/// - Windows: `py -3.13`, common install paths, registry, PATH
/// - macOS: Homebrew (Apple Silicon & Intel), system Python, PATH
fn find_python() -> Result<PathBuf, SidecarError> {
    let candidates = python_candidates();
    let mut found_version: Option<String> = None;

    for candidate in &candidates {
        println!("[sidecar] checking python: {}", candidate.display());
        match run_python_check(candidate) {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let version_str = stdout.trim().to_string();
                // Expected output: "3.13.1" or "3.13"
                if python_version_meets_requirement(&version_str) {
                    println!(
                        "[sidecar] found suitable Python {} at {}",
                        version_str,
                        candidate.display()
                    );
                    return Ok(candidate.clone());
                } else {
                    found_version = Some(version_str.clone());
                    println!(
                        "[sidecar] Python {} too old (need 3.13+)",
                        version_str
                    );
                }
            }
            Err(_) => {
                // Candidate not executable or not found, try next
            }
        }
    }

    Err(SidecarError::PythonNotFound { found_version })
}

/// Generate a list of Python executable candidates to try, in priority order.
fn python_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    #[cfg(windows)]
    {
        // 1. Python Launcher (best method on Windows)
        //    We'll check `py` in PATH by looking in common locations
        candidates.push(PathBuf::from("py"));

        // 2. Common install paths for Python 3.13+
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            for minor in (13..=20).rev() {
                candidates.push(
                    PathBuf::from(&local_app_data)
                        .join(format!("Programs\\Python\\Python{}\\python.exe", minor)),
                );
            }
        }
        if let Ok(program_files) = std::env::var("PROGRAMFILES") {
            for minor in (13..=20).rev() {
                candidates.push(
                    PathBuf::from(&program_files)
                        .join(format!("Python{}\\python.exe", minor)),
                );
            }
        }

        // 3. WindowsApps (Microsoft Store Python)
        if let Ok(user_profile) = std::env::var("USERPROFILE") {
            candidates.push(
                PathBuf::from(&user_profile)
                    .join("AppData\\Local\\Microsoft\\WindowsApps\\python3.exe"),
            );
            candidates.push(
                PathBuf::from(&user_profile)
                    .join("AppData\\Local\\Microsoft\\WindowsApps\\python.exe"),
            );
        }
    }

    #[cfg(target_os = "macos")]
    {
        // 1. Homebrew Apple Silicon
        candidates.push(PathBuf::from("/opt/homebrew/bin/python3"));
        // 2. Homebrew Intel
        candidates.push(PathBuf::from("/usr/local/bin/python3"));
        // 3. python.org installer (Frameworks)
        for minor in (13..=20).rev() {
            candidates.push(PathBuf::from(format!(
                "/Library/Frameworks/Python.framework/Versions/3.{}/bin/python3",
                minor
            )));
        }
        // 4. System Python (macOS ships 3.9+, won't meet 3.13 but check anyway)
        candidates.push(PathBuf::from("/usr/bin/python3"));
    }

    #[cfg(target_os = "linux")]
    {
        candidates.push(PathBuf::from("/usr/bin/python3.13"));
        candidates.push(PathBuf::from("/usr/bin/python3"));
        candidates.push(PathBuf::from("/usr/local/bin/python3"));
    }

    // Always try generic names from PATH as last resort
    #[cfg(windows)]
    {
        candidates.push(PathBuf::from("python.exe"));
        candidates.push(PathBuf::from("python"));
    }
    #[cfg(unix)]
    {
        candidates.push(PathBuf::from("python3"));
        candidates.push(PathBuf::from("python"));
    }

    candidates
}

/// Run a Python executable and get its version string.
/// Returns the full output of: `python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')" `
fn run_python_check(python_path: &PathBuf) -> Result<Output, std::io::Error> {
    StdCommand::new(python_path)
        .arg("-c")
        .arg("import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
}

/// Check if a version string like "3.13.1" meets the 3.13+ requirement.
fn python_version_meets_requirement(version: &str) -> bool {
    let parts: Vec<u32> = version.split('.').filter_map(|p| p.parse().ok()).collect();
    if parts.len() < 2 {
        return false;
    }
    parts[0] == 3 && parts[1] >= 13
}

// ---------------------------------------------------------------------------
// Dependency Verification
// ---------------------------------------------------------------------------

/// Verify that required Python packages are installed in the given Python environment.
fn verify_dependencies(python_path: &PathBuf) -> Result<(), SidecarError> {
    let packages = ["code_puppy", "fastapi", "uvicorn", "watchdog"];

    for pkg in &packages {
        let display_name = if *pkg == "code_puppy" {
            "code-puppy"
        } else {
            pkg
        };

        let output = match StdCommand::new(python_path)
            .arg("-c")
            .arg(format!("import {}", pkg))
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
        {
            Ok(o) => o,
            Err(_) => {
                return Err(SidecarError::DependencyMissing {
                    package: display_name.to_string(),
                    python_path: python_path.display().to_string(),
                });
            }
        };

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            println!(
                "[sidecar] package check failed for {}: {}",
                display_name, stderr.trim()
            );
            return Err(SidecarError::DependencyMissing {
                package: display_name.to_string(),
                python_path: python_path.display().to_string(),
            });
        }

        println!("[sidecar] verified package: {}", display_name);
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Path Resolution
// ---------------------------------------------------------------------------

/// Resolve the path to sidecar_main.py.
///
/// Uses `current_exe()` to locate the binary, then walks up to find
/// the project root (dev) or resources directory (release).
fn sidecar_script_path() -> PathBuf {
    let exe = std::env::current_exe().unwrap_or_default();
    let exe_parent = exe.parent().unwrap_or(std::path::Path::new("."));

    if cfg!(debug_assertions) {
        // Dev: binary is at target/debug/pupcode-ide
        // exe_parent = target/debug/
        // Go up two levels: target/debug/ -> target/ -> project-root/
        exe_parent
            .join("..")
            .join("..")
            .join("sidecar-src")
            .join("sidecar_main.py")
    } else {
        // Release: Tauri bundles resources into Contents/Resources/ (sibling of MacOS/)
        let resources = exe_parent.parent()
            .unwrap_or(exe_parent)
            .join("Resources");
        let base = if resources.exists() {
            resources
        } else {
            exe_parent.to_path_buf()
        };
        base.join("sidecar-src").join("sidecar_main.py")
    }
}

// ---------------------------------------------------------------------------
// Process tree killing
// ---------------------------------------------------------------------------

#[cfg(windows)]
fn kill_process_tree(child: &mut Child) {
    // The Job Object handles tree cleanup on parent exit.
    // For graceful stop, just kill the direct child — the job
    // will clean up any remaining processes when its handle closes.
    let _ = child.kill();
}

#[cfg(unix)]
fn kill_process_tree(child: &mut Child) {
    let pid = child.id() as i32;
    // Send SIGTERM to the entire process group
    unsafe {
        libc::kill(-pid, libc::SIGTERM);
    }
    // Wait a moment, then SIGKILL if still alive
    std::thread::sleep(Duration::from_millis(500));
    unsafe {
        libc::kill(-pid, libc::SIGKILL);
    }
    let _ = child.kill();
}

#[cfg(not(any(windows, unix)))]
fn kill_process_tree(child: &mut Child) {
    let _ = child.kill();
}

// ---------------------------------------------------------------------------
// Windows Job Object (kills entire process tree on parent exit)
// ---------------------------------------------------------------------------

#[cfg(windows)]
#[allow(dead_code)]
fn windows_assign_to_job(pid: u32) -> Result<(), String> {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStrExt;

    type HANDLE = *mut std::ffi::c_void;
    type BOOL = i32;
    type DWORD = u32;

    const FALSE: BOOL = 0;
    const TRUE: BOOL = 1;
    const PROCESS_TERMINATE: DWORD = 0x0001;
    const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u64 = 0x00002000;

    unsafe {
        // Create a unique job name
        let job_name_wide: Vec<u16> = OsString::from(format!(
            "Global\\CodePuppySidecarJob_{}",
            std::process::id()
        ))
        .encode_wide()
        .chain(Some(0))
        .collect();

        let job = windows::CreateJobObjectW(std::ptr::null_mut(), job_name_wide.as_ptr());
        if job.is_null() {
            return Err("CreateJobObjectW failed".into());
        }

        // Set kill-on-close limit
        let mut info = windows::JOB_OBJECT_LIMIT_INFORMATION {
            LimitFlags: JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE as DWORD,
            ..Default::default()
        };
        if windows::SetInformationJobObject(
            job,
            windows::JobObjectInfoClass::JobObjectBasicLimitInformation,
            &mut info as *mut _ as _,
            std::mem::size_of_val(&info) as DWORD,
        ) == FALSE
        {
            windows::CloseHandle(job);
            return Err("SetInformationJobObject failed".into());
        }

        // Open the sidecar process
        let process = windows::OpenProcess(PROCESS_TERMINATE, FALSE, pid);
        if !process.is_null() {
            let _ = windows::AssignProcessToJobObject(job, process);
            windows::CloseHandle(process);
        }

        // Leak the job handle intentionally — when Tauri exits, the OS
        // closes it, which triggers KILL_ON_JOB_CLOSE for the entire tree.
        // SAFETY: This is a deliberate leak. The OS reclaims the handle
        // when the process terminates, killing all child processes.
        #[allow(clippy::forget_copy, forgetting_copy_types)]
        std::mem::forget(job);
    }

    Ok(())
}

#[cfg(windows)]
#[allow(non_snake_case, non_camel_case_types, dead_code)]
mod windows {
    use std::ffi::c_void;

    type HANDLE = *mut c_void;
    type LPSECURITY_ATTRIBUTES = *mut c_void;
    type LPCWSTR = *const u16;
    type DWORD = u32;
    type BOOL = i32;
    type LPVOID = *mut c_void;
    type SIZE_T = usize;

    #[derive(Default)]
    #[repr(C)]
    pub struct JOB_OBJECT_LIMIT_INFORMATION {
        pub LimitFlags: DWORD,
        pub MinimumWorkingSetSize: isize,
        pub MaximumWorkingSetSize: isize,
        pub LimitDUMMYUNIONNAME: DWORD,
        pub PerProcessUserTimeLimit: i64,
        pub PerJobUserTimeLimit: i64,
        pub ScheduleCounter: DWORD,
        pub Affinity: usize,
        pub PriorityClass: DWORD,
        pub SchedulingClass: DWORD,
        pub DynamicJobSet: BOOL,
        pub SubprocessLimit: DWORD,
    }

    #[derive(Default)]
    #[repr(C)]
    pub struct IO_COUNTERS {
        pub ReadOperationCount: u64,
        pub WriteOperationCount: u64,
        pub OtherOperationCount: u64,
        pub ReadTransferCount: u64,
        pub WriteTransferCount: u64,
        pub OtherTransferCount: u64,
    }

    #[repr(C)]
    pub struct JOB_OBJECT_BASIC_ACCOUNTING_INFORMATION {
        pub TotalUserTimeTime: i64,
        pub TotalKernelTime: i64,
        pub ThisPeriodTotalUserTime: i64,
        pub ThisPeriodTotalKernelTime: i64,
        pub TotalPageFaultCount: u32,
        pub ProcessCount: u32,
        pub JobMemoryProcessCount: u32,
        pub TotalVirtualBytes: u64,
        pub TotalVirtualBytesPeak: u64,
        pub TotalVirtualBytesLimit: u64,
        pub TotalPhysicalPages: u64,
        pub TotalPhysicalPagesPeak: u64,
        pub TotalPhysicalPagesLimit: u64,
        pub TotalProcesses: u32,
        pub ActiveProcesses: u32,
        pub TerminatedProcesses: u32,
        pub JobMemoryProcessCountHighWatermark: u32,
        pub TotalVirtualBytesHighWatermark: u64,
        pub TotalPhysicalBytesHighWatermark: u64,
    }

    #[repr(u32)]
    pub enum JobObjectInfoClass {
        JobObjectBasicLimitInformation = 2,
        JobObjectBasicProcessIdList = 4,
        JobObjectBasicUIRestrictions = 5,
        JobObjectStatisticsInformation = 10,
        JobObjectExtendedLimitInformation = 9,
        JobObjectGroupInformation = 11,
        JobObjectLimitViolationInformation = 12,
        JobObjectLimitViolationInformation2 = 13,
        JobObjectCpuRateControlInformation = 15,
        JobObjectProcessLimitInformation = 16,
        JobObjectTrackingLimitInformation = 17,
    }

    #[link(name = "kernel32")]
    extern "system" {
        pub fn CreateJobObjectW(
            lpJobAttributes: LPSECURITY_ATTRIBUTES,
            lpName: LPCWSTR,
        ) -> HANDLE;

        pub fn SetInformationJobObject(
            hJob: HANDLE,
            job_object_info_class: JobObjectInfoClass,
            job_object_information: LPVOID,
            job_object_information_len: DWORD,
        ) -> BOOL;

        pub fn OpenProcess(
            dw_desired_access: DWORD,
            b_inherit_handle: BOOL,
            dw_process_id: u32,
        ) -> HANDLE;

        pub fn AssignProcessToJobObject(h_job: HANDLE, h_process: HANDLE) -> BOOL;

        pub fn CloseHandle(hObject: HANDLE) -> BOOL;
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn find_free_port() -> Result<u32, std::io::Error> {
    let socket = std::net::TcpListener::bind("127.0.0.1:0")?;
    let port: u32 = socket.local_addr()?.port().into();
    // Socket is automatically closed when dropped at end of scope.
    // The port is guaranteed to be reserved while the socket is open.
    // We pass the port (not the socket) to the child process, so the
    // socket is dropped here, releasing the port immediately before
    // the child binds. The window between drop() and child bind() is
    // minimized since child spawning happens immediately after.
    drop(socket);
    Ok(port)
}

async fn poll_health(port: u32) -> Result<(), String> {
    let max_attempts = 30;
    let interval = Duration::from_millis(500);

    for attempt in 1..=max_attempts {
        let url = format!("http://127.0.0.1:{}/api/health", port);
        match reqwest::get(&url).await {
            Ok(resp) if resp.status().is_success() => {
                println!(
                    "[sidecar] healthy on port {} (attempt {})",
                    port, attempt
                );
                return Ok(());
            }
            Ok(resp) => {
                println!(
                    "[sidecar] health check attempt {}: status {}",
                    attempt,
                    resp.status()
                );
            }
            Err(e) => {
                if attempt % 5 == 0 {
                    println!(
                        "[sidecar] health check attempt {}/{}: {} (retrying...)",
                        attempt, max_attempts, e
                    );
                }
            }
        }

        if attempt < max_attempts {
            sleep(interval).await;
        }
    }

    Err(format!(
        "Sidecar health check failed after {} attempts on port {}",
        max_attempts, port
    ))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_free_port_returns_valid_port() {
        let port = find_free_port().expect("Should find a free port");
        assert!(port > 0 && port <= 65535);
    }

    #[test]
    fn test_find_free_port_returns_unique_ports() {
        let port1 = find_free_port().expect("Should find first port");
        let port2 = find_free_port().expect("Should find second port");
        assert_ne!(port1, port2);
    }

    #[test]
    fn test_auth_token_is_64_hex_chars() {
        // Verify token generation produces correct length
        let mut rng = rand::thread_rng();
        let token: String = (0..32)
            .map(|_| {
                let byte = rng.gen::<u8>();
                format!("{:02x}", byte)
            })
            .collect();
        
        assert_eq!(token.len(), 64); // 32 bytes * 2 hex chars
        assert!(token.chars().all(|c| c.is_ascii_hexdigit()));
    }
}
