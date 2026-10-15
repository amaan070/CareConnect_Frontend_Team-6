import { useEffect, useState } from "react";

export const ACTOR_ROLES = {
    admin: "Admin",
    staff: "Clinic staff",
    patient: "Patient"
};

// Demo-only "who am I acting as" control. There is no real login:
// the choice is kept in the browser and changes what the UI lets you do.
//  - Admin / Clinic staff: see everything, can move appointments through statuses
//  - Patient: sees only their own appointments + wallet audit, books for themself,
//             cannot change appointment status
export default function ActorSwitcher({ actor, onChange }) {
    const [patients, setPatients] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [reloadTick, setReloadTick] = useState(0);

    const isPatient = actor.role === "patient";

    useEffect(() => {
        if (!isPatient) return;

        let cancelled = false;

        const load = async () => {
            try {
                setLoading(true);
                setError("");

                const response = await fetch(
                    "http://localhost:5000/api/patients?page=1&limit=500"
                );

                if (!response.ok) {
                    throw new Error("Could not load patients");
                }

                const data = await response.json();

                if (!cancelled) setPatients(data.patients || []);
            } catch (err) {
                console.error(err);
                if (!cancelled) {
                    setError("Could not load patients for the demo switcher.");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();

        return () => {
            cancelled = true;
        };
    }, [isPatient, reloadTick]);

    const changeRole = (role) => {
        onChange({ role, patientId: "", patientName: "" });
    };

    const changePatient = (id) => {
        const match = patients.find((p) => p.id === id);
        onChange({
            role: "patient",
            patientId: id,
            patientName: match ? match.name : ""
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

            {isPatient && (
                <label className="actor-field">
                    <span>Patient</span>
                    <select
                        value={actor.patientId}
                        onChange={(e) => changePatient(e.target.value)}
                        disabled={loading || (!!error && patients.length === 0)}
                        aria-label="Demo patient"
                    >
                        <option value="">
                            {loading ? "Loading patients..." : "Select a patient"}
                        </option>
                        {patients.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                    </select>
                </label>
            )}

            {isPatient && error && (
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

            {isPatient && !loading && !error && patients.length === 0 && (
                <span className="actor-note">No patients exist yet.</span>
            )}

            {isPatient && !actor.patientId && !loading && patients.length > 0 && (
                <span className="actor-note">
                    Pick a patient to continue as them.
                </span>
            )}

            {!isPatient && (
                <span className="actor-note">
                    Demo mode - no login required.
                </span>
            )}
        </div>
    );
}
