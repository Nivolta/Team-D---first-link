const employeeTable = document.querySelector("#employee-table-body");
const employeeSearch = document.querySelector("#employee-search");
const requestForm = document.querySelector("#request-form");
const requestResult = document.querySelector("#request-result");
const notice = document.querySelector("#api-notice");
const noticeText = document.querySelector("#api-notice-text");

let employees = [];
let requests = [];
let activeView = "employees";

function errorMessage(payload, fallback) {
  if (typeof payload?.detail === "string") return payload.detail;
  if (Array.isArray(payload?.detail)) return payload.detail.map((item) => item.msg).join(", ");
  return fallback;
}

function isRecordList(value) {
  return Array.isArray(value) && value.every((item) => item !== null && typeof item === "object" && !Array.isArray(item));
}

async function getJson(path) {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`The API returned an unreadable response (${response.status}).`);
  }
  if (!response.ok) throw new Error(errorMessage(payload, `The API request failed (${response.status}).`));
  return payload;
}

function setNotice(message) {
  noticeText.textContent = message;
  notice.hidden = !message;
}

function setConnection(isOnline) {
  const dot = document.querySelector("#connection-dot");
  dot.classList.toggle("is-online", isOnline);
  dot.classList.toggle("is-offline", !isOnline);
  document.querySelector("#connection-label").textContent = isOnline ? "API connected" : "API unavailable";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0]?.slice(0, 2) || "?").toUpperCase();
}

function employeeName(employee) {
  const known = [employee.name, employee.full_name, employee.employee_name]
    .find((value) => typeof value === "string" && value.trim());
  return known || `Employee ${employee.employee_id ?? ""}`.trim();
}

function employeeId(employee) {
  return employee.employee_id ?? employee.id ?? "—";
}

function recordDetails(record, excludedKeys) {
  const fields = Object.entries(record).filter(([key]) => !excludedKeys.has(key));
  if (!fields.length) return "No additional details";
  return fields.map(([key, value]) => `${key.replaceAll("_", " ")}: ${value ?? "—"}`).join(" · ");
}

function renderEmployees(search = "") {
  const query = search.trim().toLowerCase();
  const filtered = employees.filter((employee) =>
    `${employeeName(employee)} ${employeeId(employee)} ${JSON.stringify(employee)}`.toLowerCase().includes(query),
  );
  document.querySelector("#employee-total").textContent = String(employees.length);
  document.querySelector("#employee-nav-count").textContent = String(employees.length);
  document.querySelector("#employee-result-count").textContent =
    `Showing ${filtered.length} of ${employees.length} ${employees.length === 1 ? "employee" : "employees"}`;
  document.querySelector("#employee-description").textContent =
    employees.length ? "Browse and search employee records." : "No employee records are available yet.";

  if (!filtered.length) {
    const message = query ? "No matching employees" : "No employee records yet";
    const detail = query ? "Try a different name or employee ID." : "When employee records are available, they will appear here.";
    employeeTable.innerHTML = `<tr><td colspan="4" class="empty-cell"><strong>${message}</strong><span>${detail}</span></td></tr>`;
    return;
  }

  employeeTable.innerHTML = filtered.map((employee, index) => {
    const name = employeeName(employee);
    const id = employeeId(employee);
    const details = recordDetails(employee, new Set(["employee_id", "id", "name", "full_name", "employee_name"]));
    return `<tr>
      <td><div class="employee-cell"><span class="employee-avatar color-${index % 5}">${escapeHtml(initials(name))}</span><span>${escapeHtml(name)}</span></div></td>
      <td><span class="id-pill">${escapeHtml(id)}</span></td>
      <td><span class="detail-copy" title="${escapeHtml(details)}">${escapeHtml(details)}</span></td>
      <td><button class="row-action" type="button" data-employee-id="${escapeHtml(id)}" title="Look up a request for this employee" aria-label="Look up a request for ${escapeHtml(name)}">↗</button></td>
    </tr>`;
  }).join("");
}

function renderRequests() {
  document.querySelector("#request-total").textContent = String(requests.length);
  document.querySelector("#request-nav-count").textContent = String(requests.length);
  document.querySelector("#request-total-label").textContent =
    `${requests.length} ${requests.length === 1 ? "request record" : "request records"} loaded from the API.`;
  const container = document.querySelector("#request-records");
  if (!requests.length) {
    container.innerHTML = "";
    return;
  }
  const rows = requests.slice(0, 12).map((request) => {
    const requester = request.requester_id ?? "—";
    const employee = request.employee_id ?? "—";
    return `<li>Requester ${escapeHtml(requester)} <span aria-hidden="true">→</span> Employee ${escapeHtml(employee)}</li>`;
  }).join("");
  container.innerHTML = `<h3>Recent request records</h3><ul>${rows}</ul>`;
}

function showLookupMessage(message, isError = false) {
  requestResult.innerHTML = isError
    ? `<div class="lookup-error">${escapeHtml(message)}</div>`
    : `<div class="empty-lookup"><span class="empty-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.75h7l4 4V20a.25.25 0 0 1-.25.25h-10.5A.25.25 0 0 1 7 20V4a.25.25 0 0 1 .25-.25ZM14 4v4h4M10 12h5m-5 3h5" /></svg></span><strong>${escapeHtml(message)}</strong><p>Check the IDs and try again.</p></div>`;
}

function showRequest(request) {
  const fields = Object.entries(request).map(([key, value]) =>
    `<div class="record-field"><span>${escapeHtml(key.replaceAll("_", " "))}</span><strong>${escapeHtml(value ?? "—")}</strong></div>`,
  ).join("");
  requestResult.innerHTML = `<div class="lookup-success">${fields || "<div>No details returned.</div>"}</div>`;
}

async function loadData() {
  const refreshButton = document.querySelector("#refresh-button");
  const retryButton = document.querySelector("#employee-retry");
  refreshButton.disabled = true;
  retryButton.disabled = true;
  setNotice("");
  employeeTable.innerHTML = '<tr><td colspan="4" class="loading-cell"><span class="spinner"></span>Loading employee records…</td></tr>';
  setConnection(false);

  const [employeeResult, requestResultData] = await Promise.allSettled([
    getJson("/employee"),
    getJson("/request"),
  ]);

  const errors = [];
  if (employeeResult.status === "fulfilled" && isRecordList(employeeResult.value)) {
    employees = employeeResult.value;
    renderEmployees(employeeSearch.value);
  } else {
    employees = [];
    const error = employeeResult.status === "rejected"
      ? employeeResult.reason.message
      : "The employee endpoint did not return a list.";
    errors.push(`Employees: ${error}`);
    employeeTable.innerHTML = `<tr><td colspan="4" class="empty-cell"><strong>Could not load employee records</strong><span>${escapeHtml(error)}</span></td></tr>`;
    document.querySelector("#employee-total").textContent = "—";
    document.querySelector("#employee-nav-count").textContent = "—";
    document.querySelector("#employee-result-count").textContent = "Employee data unavailable";
  }

  if (requestResultData.status === "fulfilled" && isRecordList(requestResultData.value)) {
    requests = requestResultData.value;
    renderRequests();
  } else {
    requests = [];
    const error = requestResultData.status === "rejected"
      ? requestResultData.reason.message
      : "The request endpoint did not return a list.";
    errors.push(`Requests: ${error}`);
    document.querySelector("#request-total").textContent = "—";
    document.querySelector("#request-nav-count").textContent = "—";
    document.querySelector("#request-total-label").textContent = "Request data unavailable.";
  }

  const online = employeeResult.status === "fulfilled" || requestResultData.status === "fulfilled";
  setConnection(online);
  if (!errors.length) {
    setNotice("");
  } else {
    setNotice(`${errors.join("  ")}`);
  }
  refreshButton.disabled = false;
  retryButton.disabled = false;
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    activeView = button.dataset.view;
    document.querySelectorAll(".nav-item").forEach((item) => {
      const isActive = item === button;
      item.classList.toggle("active", isActive);
      if (isActive) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
    const showEmployees = activeView === "employees";
    document.querySelector("#employee-view").hidden = !showEmployees;
    document.querySelector("#request-view").hidden = showEmployees;
    document.querySelector("#page-title").textContent = showEmployees ? "Employees" : "Requests";
    document.querySelector("#page-subtitle").textContent = showEmployees
      ? "A simple, clear view of your employee directory."
      : "Find and explore employee request records.";
    document.querySelector("#breadcrumb-current").textContent = showEmployees ? "Employees" : "Requests";
  });
});

employeeSearch.addEventListener("input", () => renderEmployees(employeeSearch.value));
document.querySelector("#refresh-button").addEventListener("click", loadData);
document.querySelector("#employee-retry").addEventListener("click", loadData);
document.querySelector("#notice-close").addEventListener("click", () => setNotice(""));
employeeTable.addEventListener("click", (event) => {
  const button = event.target.closest("[data-employee-id]");
  if (!button) return;
  const employee = employees.find((item) => String(employeeId(item)) === button.dataset.employeeId);
  if (!employee) return;
  document.querySelector('[data-view="requests"]').click();
  requestForm.elements.employee_id.value = employeeId(employee);
  requestForm.elements.requester_id.focus();
});

requestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const requesterId = requestForm.elements.requester_id.value.trim();
  const employeeIdValue = requestForm.elements.employee_id.value.trim();
  if (!requesterId || !employeeIdValue) return;
  const submitButton = requestForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  showLookupMessage("Searching for request…", false);
  try {
    const request = await getJson(`/request/${encodeURIComponent(requesterId)}/${encodeURIComponent(employeeIdValue)}`);
    showRequest(request);
  } catch (error) {
    showLookupMessage(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    employeeSearch.focus();
  }
});

loadData();
