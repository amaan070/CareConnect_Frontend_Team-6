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
//
// Layout rule: the bar is always ONE row, so the header never changes
// height. Anything extra (search results, "no match", errors) floats.
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
                            ? "Couldn't load patients."
                            : "Couldn't load clinics."
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

    const patientPlaceholder = loading
        ? "Loading patients..."
        : !error && patients.length === 0
            ? "No patients exist yet"
            : "Search patient by name...";

    const clinicPlaceholder = loading
        ? "Loading clinics..."
        : !error && clinics.length === 0
            ? "No clinics exist yet"
            : "Select a clinic";

    // The floating list shows whenever the user has typed something
    const showResults =
        isPatient && !actor.patientId && !loading && !error && !!trimmed;

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
                <label
                    className="actor-field"
                    title="Pick the clinic you work at. You will only manage that clinic."
                >
                    <span>Clinic</span>
                    <select
                        value={actor.clinicId}
                        onChange={(e) => changeClinic(e.target.value)}
                        disabled={loading || (!!error && clinics.length === 0)}
                        aria-label="Demo clinic"
                    >
                        <option value="">{clinicPlaceholder}</option>

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

                    {actor.patientId ? (
                        <div className="actor-selected">
                            <strong>
                                {actor.patientName || `ID ${actor.patientId}`}
                            </strong>
                            <button
                                type="button"
                                className="actor-link"
                                onClick={clearPatient}
                            >
                                Change
                            </button>
                        </div>
                    ) : (
                        <div className="actor-search">
                            <input
                                type="text"
                                placeholder={patientPlaceholder}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                disabled={loading || patients.length === 0}
                                aria-label="Search patients by name"
                                autoComplete="off"
                            />

                            {showResults && (
                                <ul className="actor-results">
                                    {matches
                                        .slice(0, MAX_RESULTS_SHOWN)
                                        .map((p) => (
                                            <li key={p.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => choosePatient(p)}
                                                >
                                                    {p.name}
                                                </button>
                                            </li>
                                        ))}

                                    {matches.length === 0 && (
                                        <li className="actor-results-note">
                                            No patients match "{query.trim()}"
                                        </li>
                                    )}

                                    {matches.length > MAX_RESULTS_SHOWN && (
                                        <li className="actor-results-note">
                                            Showing {MAX_RESULTS_SHOWN} of{" "}
                                            {matches.length} - keep typing to
                                            narrow it down
                                        </li>
                                    )}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ---------------- short notes (always one line) ---------------- */}

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

            {actor.role === "admin" && (
                <span className="actor-note">
                    Demo mode - no login required.
                </span>
            )}
        </div>
    );
}
