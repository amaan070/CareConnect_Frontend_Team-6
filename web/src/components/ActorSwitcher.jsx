import { useEffect, useMemo, useState } from "react";

export const ACTOR_ROLES = {
    admin: "Admin",
    staff: "Clinic staff",
    patient: "Patient"
};

const API = "http://localhost:5000/api";
const PAGE_SIZE = 100;
const MAX_PAGES = 200; // safety stop
const MAX_RESULTS_SHOWN = 30;

const EMPTY = { patientId: "", patientName: "", clinicId: "", clinicName: "" };

// Loads every page of a list endpoint (e.g. "patients" -> data.patients),
// so nothing is missed even if the API caps the page size.
const fetchAll = async (resource) => {
    const byId = new Map();
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages && page <= MAX_PAGES) {
        const response = await fetch(
            `${API}/${resource}?page=${page}&limit=${PAGE_SIZE}`
        );

        if (!response.ok) {
            throw new Error(`Could not load ${resource}`);
        }

        const data = await response.json();
        const rows = data[resource] || [];
        totalPages = Number(data.totalPages) || 1;

        const before = byId.size;
        rows.forEach((row) => byId.set(String(row.id), row));

        if (rows.length === 0 || byId.size === before) break;
        page += 1;
    }

    return [...byId.values()].sort((a, b) =>
        String(a.name).localeCompare(String(b.name))
    );
};

// Demo-only "who am I acting as" control. There is no real login:
// the choice is kept in the browser and changes what the UI lets you do.
//  - Admin: sees everything, can move appointments through statuses
//  - Clinic staff: belongs to ONE clinic (chosen here) and only sees and
//                  manages that clinic's data
//  - Patient: sees only their own appointments + wallet audit, books for
//             themself, cannot change appointment status
export default function ActorSwitcher({ actor, onChange }) {
    const [patients, setPatients] = useState([]);
    const [clinics, setClinics] = useState([]);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [reloadTick, setReloadTick] = useState(0);

    const isPatient = actor.role === "patient";
    const isStaff = actor.role === "staff";

    useEffect(() => {
        if (!isPatient && !isStaff) return;

        let cancelled = false;

        const load = async () => {
            try {
                setLoading(true);
                setError("");

                const rows = await fetchAll(isPatient ? "patients" : "clinics");

                if (cancelled) return;

                if (isPatient) setPatients(rows);
                else setClinics(rows);
            } catch (err) {
                console.error(err);
                if (!cancelled) {
                    setError(
                        isPatient
                            ? "Could not load patients for the demo switcher."
                            : "Could not load clinics for the demo switcher."
                    );
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();

        return () => {
            cancelled = true;
        };
    }, [isPatient, isStaff, reloadTick]);

    const trimmed = query.trim().toLowerCase();

    const matches = useMemo(() => {
        if (!trimmed) return [];
        return patients.filter((p) =>
            String(p.name).toLowerCase().includes(trimmed)
        );
    }, [patients, trimmed]);

    const changeRole = (role) => {
        setQuery("");
        onChange({ role, ...EMPTY });
    };

    const choosePatient = (patient) => {
        setQuery("");
        onChange({
            role: "patient",
            ...EMPTY,
            patientId: patient.id,
            patientName: patient.name
        });
    };

    const clearPatient = () => {
        onChange({ role: "patient", ...EMPTY });
    };

    const changeClinic = (id) => {
        const match = clinics.find((c) => String(c.id) === String(id));
        onChange({
            role: "staff",
            ...EMPTY,
            clinicId: id,
            clinicName: match ? match.name : ""
        });
    };

    return (
        <div className="actor-bar">
            <label className="actor-field">
                <span>Acting as</span>
                <select
                    value={actor.role}
                    onChange={(e) => changeRole(e.target.value)}
                    aria-label="Demo user role"
                >
                    {Object.entries(ACTOR_ROLES).map(([value, label]) => (
                        <option key={value} value={value}>
                            {label}
                        </option>
                    ))}
                </select>
            </label>

            {/* ---------------- CLINIC STAFF: choose their clinic ---------------- */}

            {isStaff && (
                <label className="actor-field">
                    <span>Clinic</span>
                    <select
                        value={actor.clinicId}
                        onChange={(e) => changeClinic(e.target.value)}
                        disabled={loading || (!!error && clinics.length === 0)}
                        aria-label="Demo clinic"
                    >
                        <option value="">
                            {loading ? "Loading clinics..." : "Select a clinic"}
                        </option>

                        {/* keep the saved clinic visible until the list loads */}
                        {actor.clinicId &&
                            !clinics.some(
                                (c) => String(c.id) === String(actor.clinicId)
                            ) && (
                                <option value={actor.clinicId}>
                                    {actor.clinicName || `Clinic ${actor.clinicId}`}
                                </option>
                            )}

                        {clinics.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                </label>
            )}

            {/* ---------------- PATIENT: search for who they are ---------------- */}

            {isPatient && (
                <div className="actor-field">
                    <span>Patient</span>

                    {actor.patientId && (
                        <div className="actor-selected">
                            <strong>
                                {actor.patientName || `ID ${actor.patientId}`}
                            </strong>{" "}
                            <button
                                type="button"
                                className="actor-link"
                                onClick={clearPatient}
                            >
                                Change
                            </button>
                        </div>
                    )}

                    {!actor.patientId && (
                        <>
                            <input
                                type="text"
                                placeholder={
                                    loading
                                        ? "Loading patients..."
                                        : "Search patient by name..."
                                }
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                disabled={loading || (!!error && patients.length === 0)}
                                aria-label="Search patients by name"
                            />

                            {trimmed && matches.length > 0 && (
                                <ul
                                    className="actor-results"
                                    style={{
                                        listStyle: "none",
                                        margin: "4px 0 0",
                                        padding: 0,
                                        maxHeight: "220px",
                                        overflowY: "auto",
                                        border: "1px solid #cbd5e1",
                                        borderRadius: "6px",
                                        background: "#fff",
                                        color: "#0f172a"
                                    }}
                                >
                                    {matches
                                        .slice(0, MAX_RESULTS_SHOWN)
                                        .map((p) => (
                                            <li key={p.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => choosePatient(p)}
                                                    style={{
                                                        display: "block",
                                                        width: "100%",
                                                        textAlign: "left",
                                                        padding: "6px 10px",
                                                        background: "transparent",
                                                        color: "inherit",
                                                        border: "none",
                                                        cursor: "pointer"
                                                    }}
                                                >
                                                    {p.name}
                                                </button>
                                            </li>
                                        ))}
                                </ul>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ---------------- notes / errors ---------------- */}

            {(isPatient || isStaff) && error && (
                <span className="actor-note actor-note-error">
                    {error}{" "}
                    <button
                        type="button"
                        className="actor-link"
                        onClick={() => setReloadTick((n) => n + 1)}
                    >
                        Retry
                    </button>
                </span>
            )}

            {isStaff && !loading && !error && clinics.length === 0 && (
                <span className="actor-note">No clinics exist yet.</span>
            )}

            {isStaff && !actor.clinicId && !loading && clinics.length > 0 && (
                <span className="actor-note">
                    Pick the clinic you work at. You will only manage that clinic.
                </span>
            )}

            {isPatient &&
                !actor.patientId &&
                !loading &&
                !error &&
                trimmed &&
                matches.length === 0 && (
                    <span className="actor-note">
                        No patients match "{query.trim()}".
                    </span>
                )}

            {isPatient &&
                !actor.patientId &&
                matches.length > MAX_RESULTS_SHOWN && (
                    <span className="actor-note">
                        Showing {MAX_RESULTS_SHOWN} of {matches.length} - type
                        more to narrow it down.
                    </span>
                )}

            {isPatient && !loading && !error && patients.length === 0 && (
                <span className="actor-note">No patients exist yet.</span>
            )}

            {actor.role === "admin" && (
                <span className="actor-note">
                    Demo mode - no login required.
                </span>
            )}
        </div>
    );
}
