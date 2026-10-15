import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

const STATUS_LABELS = {
    WAITING: "Waiting",
    IN_CONSULTATION: "In consultation",
    DISCHARGED: "Discharged"
};

const STATUS_CLASSES = {
    WAITING: "status-waiting",
    IN_CONSULTATION: "status-consultation",
    DISCHARGED: "status-discharged"
};

function StatusBadge({ status }) {
    return (
        <span className={`status-badge ${STATUS_CLASSES[status] ?? ""}`}>
            {STATUS_LABELS[status] ?? status}
        </span>
    );
}

function YesNoBadge({ value }) {
    return (
        <span className={value ? "available" : "unavailable"}>
            {value ? "Yes" : "No"}
        </span>
    );
}

// =========================
// ANALYTICS HELPERS
// =========================

const CHART_COLORS = [
    "#0e7490",
    "#d97706",
    "#7c3aed",
    "#16a34a",
    "#db2777",
    "#2563eb"
];

const formatMoney = (value) =>
    `$${Number(value || 0).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;

// "2026-10-14T00:00:00.000Z" and "2026-10-14" both become "2026-10-14"
const toDateKey = (value) => String(value).slice(0, 10);

const formatDateKey = (key, options) =>
    new Date(`${key}T00:00:00`).toLocaleDateString("en-US", options);

// Uses the server's refresh time if the API sends one,
// otherwise the time this browser received the data.
const readRefreshedAt = (data) => {
    const serverTime =
        data?.last_refreshed ??
        data?.refreshed_at ??
        data?.lastRefreshed ??
        null;

    return serverTime
        ? { time: serverTime, fromServer: true }
        : { time: new Date().toISOString(), fromServer: false };
};

// Every clinic in the revenue data, sorted by name: [{ id, name }]
const getRevenueClinics = (rows) => {
    const byId = new Map();
    rows.forEach((r) => {
        if (!byId.has(String(r.clinic_id))) {
            byId.set(String(r.clinic_id), {
                id: String(r.clinic_id),
                name: r.clinic_name ?? `Clinic ${r.clinic_id}`
            });
        }
    });
    return [...byId.values()].sort((a, b) =>
        String(a.name).localeCompare(String(b.name))
    );
};

// First 6 clinics use the fixed palette; the rest get evenly
// spread hues so every clinic still has its own colour.
const clinicColor = (index) =>
    index < CHART_COLORS.length
        ? CHART_COLORS[index]
        : `hsl(${Math.round((index * 137.5) % 360)}, 55%, 42%)`;

// Line chart of the 7-day moving average (window-function query)
// for one selected clinic. Plain SVG, no chart library needed.
function MovingAverageChart({ rows, selectedClinicId }) {
    if (!rows || rows.length === 0) return null;

    const dates = [...new Set(rows.map((r) => toDateKey(r.revenue_date)))].sort();

    // Each clinic keeps a stable colour based on its place in the list
    const allClinics = getRevenueClinics(rows).map((c, i) => ({
        ...c,
        color: clinicColor(i)
    }));

    const shownClinics = allClinics.filter(
        (c) => c.id === String(selectedClinicId)
    );

    if (shownClinics.length === 0) return null;


    const series = shownClinics.map(({ id, name, color }) => {
        const clinicRows = rows.filter((r) => String(r.clinic_id) === id);
        const byDate = new Map(
            clinicRows.map((r) => [
                toDateKey(r.revenue_date),
                Number(r.moving_7_day_average)
            ])
        );
        return {
            id,
            name,
            color,
            points: dates
                .map((d, index) => ({ index, date: d, value: byDate.get(d) }))
                .filter((p) => Number.isFinite(p.value))
        };
    });

    // Single clinic: also draw its raw daily revenue (dashed) so the
    // smoothing effect of the 7-day window is visible.
    if (shownClinics.length === 1) {
        const only = shownClinics[0];
        const byDate = new Map(
            rows
                .filter((r) => String(r.clinic_id) === only.id)
                .map((r) => [toDateKey(r.revenue_date), Number(r.daily_revenue)])
        );
        series.unshift({
            id: `${only.id}-daily`,
            name: `${only.name} — daily revenue`,
            color: "#94a3b8",
            dashed: true,
            points: dates
                .map((d, index) => ({ index, date: d, value: byDate.get(d) }))
                .filter((p) => Number.isFinite(p.value))
        });
        series[1] = { ...series[1], name: `${only.name} — 7-day average` };
    }

    const width = 760;
    const height = 280;
    const pad = { top: 16, right: 20, bottom: 34, left: 70 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const maxValue = Math.max(
        1,
        ...series.flatMap((s) => s.points.map((p) => p.value))
    );
    const yMax = Math.ceil((maxValue * 1.1) / 10) * 10;

    const x = (index) =>
        pad.left + (dates.length === 1 ? plotW / 2 : (index / (dates.length - 1)) * plotW);
    const y = (value) => pad.top + plotH - (value / yMax) * plotH;

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * yMax);
    const labelEvery = Math.max(1, Math.ceil(dates.length / 7));

    return (
        <div className="chart-card">
            <svg
                className="chart-svg"
                viewBox={`0 0 ${width} ${height}`}
                role="img"
                aria-label="7-day moving average revenue per clinic"
            >
                {yTicks.map((tick) => (
                    <g key={tick}>
                        <line
                            className="chart-grid"
                            x1={pad.left}
                            x2={width - pad.right}
                            y1={y(tick)}
                            y2={y(tick)}
                        />
                        <text
                            className="chart-label"
                            x={pad.left - 10}
                            y={y(tick)}
                            textAnchor="end"
                            dominantBaseline="middle"
                        >
                            {formatMoney(tick).replace(/\.00$/, "")}
                        </text>
                    </g>
                ))}

                {dates.map((d, i) =>
                    i % labelEvery === 0 || i === dates.length - 1 ? (
                        <text
                            key={d}
                            className="chart-label"
                            x={x(i)}
                            y={height - 10}
                            textAnchor="middle"
                        >
                            {formatDateKey(d, { month: "short", day: "numeric" })}
                        </text>
                    ) : null
                )}

                {series.map((s) => (
                    <g key={s.id}>
                        <polyline
                            fill="none"
                            stroke={s.color}
                            strokeWidth={s.dashed ? 1.5 : 2.5}
                            strokeDasharray={s.dashed ? "5 4" : undefined}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            points={s.points
                                .map((p) => `${x(p.index)},${y(p.value)}`)
                                .join(" ")}
                        />
                        {s.points.map((p) => (
                            <circle
                                key={p.date}
                                cx={x(p.index)}
                                cy={y(p.value)}
                                r={s.dashed ? 2.5 : 3.5}
                                fill={s.color}
                            >
                                <title>
                                    {`${s.name} · ${formatDateKey(p.date, {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric"
                                    })} · ${formatMoney(p.value)}`}
                                </title>
                            </circle>
                        ))}
                    </g>
                ))}
            </svg>

            <ul className="chart-legend">
                {series.map((s) => (
                    <li key={s.id}>
                        <span
                            className="chart-swatch"
                            style={{ background: s.color }}
                        />
                        {s.name}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function App() {

const refreshDischargeAnalytics = async () => {
    try {
        setDischargeLoading(true);
        setDischargeError("");

        const response = await fetch(
            "http://localhost:5000/api/analytics/discharges/refresh",
            {
                method: "POST"
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(
                errorData.details ||
                errorData.error ||
                "Failed to refresh materialized view"
            );
        }

        // Fetch the updated materialized view
        const dataResponse = await fetch(
            "http://localhost:5000/api/analytics/discharges"
        );

        if (!dataResponse.ok) {
            throw new Error("Failed to fetch refreshed data");
        }

        const data = await dataResponse.json();

        setDischargeData(data.summary || []);

        // Prefer the time the refresh endpoint reports, then the data endpoint's
        const refreshResult = await response.json().catch(() => ({}));
        const fromRefresh = readRefreshedAt(refreshResult);
        setDischargeRefreshedAt(
            fromRefresh.fromServer ? fromRefresh : readRefreshedAt(data)
        );

    } catch (error) {
        console.error("Discharge refresh error:", error);

        setDischargeError(
            error.message || "Failed to refresh discharge analytics"
        );

    } finally {
        setDischargeLoading(false);
    }
};
    // =========================
    // GENERAL
    // =========================

    const [view, setView] = useState("patients");

    const [loading, setLoading] = useState(true);
    const [initialLoadDone, setInitialLoadDone] = useState(false);
    const [error, setError] = useState("");

    // =========================
    // PATIENTS
    // =========================

    const [patients, setPatients] = useState([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");

    const [selectedPatient, setSelectedPatient] = useState(null);
    const [patientDetails, setPatientDetails] = useState(null);

    // =========================
    // CLINICS
    // =========================

    const [clinics, setClinics] = useState([]);
    const [clinicPage, setClinicPage] = useState(1);
    const [clinicTotalPages, setClinicTotalPages] = useState(1);

    const [clinicSearchInput, setClinicSearchInput] = useState("");
    const [clinicSearch, setClinicSearch] = useState("");

    const [selectedClinic, setSelectedClinic] = useState(null);
    const [clinicDetails, setClinicDetails] = useState(null);

    // =========================
    // APPOINTMENTS
    // =========================

    const [appointments, setAppointments] = useState([]);
    const [appointmentPage, setAppointmentPage] = useState(1);
    const [appointmentTotalPages, setAppointmentTotalPages] =
        useState(1);

    const [appointmentStatus, setAppointmentStatus] = useState("");

    const [appointmentSearchInput, setAppointmentSearchInput] =
        useState("");
    const [appointmentSearch, setAppointmentSearch] =
        useState("");

    const [selectedAppointment, setSelectedAppointment] =
        useState(null);
    const [appointmentDetails, setAppointmentDetails] =
        useState(null);

    // =========================
    // BOOKING
    // =========================

    const [bookingPatients, setBookingPatients] = useState([]);
    const [bookingClinics, setBookingClinics] = useState([]);

    const [bookingPatientId, setBookingPatientId] = useState("");
    const [bookingClinicId, setBookingClinicId] = useState("");
    const [bookingCopay, setBookingCopay] = useState("");

    const [bookingLoading, setBookingLoading] = useState(false);
    const [bookingResult, setBookingResult] = useState(null);
    const [bookingError, setBookingError] = useState("");

    // =========================
    // AUDIT TRAIL
    // =========================

    const [auditPatients, setAuditPatients] = useState([]);

    const [auditPatientId, setAuditPatientId] = useState("");
    const [auditFrom, setAuditFrom] = useState("");
    const [auditTo, setAuditTo] = useState("");

    const [auditLogs, setAuditLogs] = useState([]);
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditError, setAuditError] = useState("");

    const [analyticsData, setAnalyticsData] = useState([]);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);
    const [analyticsError, setAnalyticsError] = useState("");

    const [dischargeData, setDischargeData] = useState([]);
    const [dischargeLoading, setDischargeLoading] = useState(false);
    const [dischargeError, setDischargeError] = useState("");
    const [dischargeRefreshedAt, setDischargeRefreshedAt] = useState(null);
    const [chartClinicId, setChartClinicId] = useState("");
    // =========================
    // FETCH PATIENTS
    // =========================

    const [reviewData, setReviewData] = useState(null);
    const [catalogData, setCatalogData] = useState([]);
    const [reviewsLoading, setReviewsLoading] = useState(false);
    const [reviewsError, setReviewsError] = useState("");

    const [nurseData, setNurseData] = useState([]);
    const [mapLatitude, setMapLatitude] = useState("13.0827");
    const [mapLongitude, setMapLongitude] = useState("80.2707");
    const [mapLoading, setMapLoading] = useState(false);
    const [mapError, setMapError] = useState("");

    useEffect(() => {
    if (view !== "map") return;

    let cancelled = false;

    const fetchNurses = async () => {
        try {
            setMapLoading(true);
            setMapError("");

            const params = new URLSearchParams({
                latitude: mapLatitude,
                longitude: mapLongitude,
                limit: "20"
            });

            const response = await fetch(
                `http://localhost:5000/api/map/nearest-nurses?${params}`
            );

            if (!response.ok) {
                throw new Error("Failed to fetch nearby nurses");
            }

            const data = await response.json();

            if (!cancelled) {
                setNurseData(data.nurses || []);
            }
        } catch (error) {
            if (!cancelled) {
                setMapError(error.message || "Failed to load nearby nurses");
            }
        } finally {
            if (!cancelled) {
                setMapLoading(false);
            }
        }
    };

    fetchNurses();

    const intervalId = setInterval(fetchNurses, 10000);

    return () => {
        cancelled = true;
        clearInterval(intervalId);
    };
}, [view, mapLatitude, mapLongitude]);

useEffect(() => {
    if (view !== "analytics") {
        return;
    }

    let cancelled = false;

    // Revenue (window functions) and discharges (materialized view)
    // load independently, so one failing doesn't hide the other.
    const fetchRevenue = async () => {
        try {
            setAnalyticsLoading(true);
            setAnalyticsError("");

            const revenueResponse = await fetch(
                "http://localhost:5000/api/analytics/clinic-revenue"
            );

            if (!revenueResponse.ok) {
                throw new Error("Failed to fetch revenue analytics");
            }

            const revenueData = await revenueResponse.json();

            if (!cancelled) {
                setAnalyticsData(revenueData.analytics || []);
            }
        } catch (error) {
            console.error(error);
            if (!cancelled) {
                setAnalyticsError("Failed to load revenue analytics");
            }
        } finally {
            if (!cancelled) setAnalyticsLoading(false);
        }
    };

    const fetchDischarges = async () => {
        try {
            setDischargeLoading(true);
            setDischargeError("");

            const dischargeResponse = await fetch(
                "http://localhost:5000/api/analytics/discharges"
            );

            if (!dischargeResponse.ok) {
                throw new Error("Failed to fetch discharge analytics");
            }

            const dischargeResult = await dischargeResponse.json();

            if (!cancelled) {
                setDischargeData(dischargeResult.summary || []);
                setDischargeRefreshedAt(readRefreshedAt(dischargeResult));
            }
        } catch (error) {
            console.error(error);
            if (!cancelled) {
                setDischargeError("Failed to load discharge analytics");
            }
        } finally {
            if (!cancelled) setDischargeLoading(false);
        }
    };

    fetchRevenue();
    fetchDischarges();

    return () => {
        cancelled = true;
    };

}, [view]);


useEffect(() => {
    if (view !== "reviews") return;

    let cancelled = false;

    const fetchReviews = async () => {
        try {
            setReviewsLoading(true);
            setReviewsError("");

            const [analyticsResponse, catalogsResponse] =
                await Promise.all([
                    fetch("http://localhost:5000/api/reviews/analytics"),
                    fetch("http://localhost:5000/api/reviews/catalogs")
                ]);

            if (!analyticsResponse.ok) {
                throw new Error("Failed to fetch review analytics");
            }

            if (!catalogsResponse.ok) {
                throw new Error("Failed to fetch medical catalogs");
            }

            const analytics = await analyticsResponse.json();
            const catalogs = await catalogsResponse.json();

            if (!cancelled) {
                setReviewData(analytics);
                setCatalogData(catalogs.catalogs || []);
            }
        } catch (err) {
            if (!cancelled) {
                console.error("Reviews loading error:", err);
                setReviewsError(err.message || "Failed to load reviews");
            }
        } finally {
            if (!cancelled) {
                setReviewsLoading(false);
            }
        }
    };

    fetchReviews();

    return () => {
        cancelled = true;
    };
}, [view]);


    useEffect(() => {
        if (view !== "patients") return;

        let cancelled = false;
        const fetchPatients = async () => {
            try {
                setLoading(true);
                setError("");

                const response = await fetch(
                    `http://localhost:5000/api/patients?page=${page}&limit=20&search=${encodeURIComponent(
                        search
                    )}`
                );

                if (!response.ok) {
                    throw new Error("Failed to fetch patients");
                }

                const data = await response.json();

                if (cancelled) return;

                setPatients(data.patients);
                setTotalPages(data.totalPages);
            } catch (err) {
                console.error(err);
                setError("Failed to load patients");
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchPatients();
        return () => {
            cancelled = true;
        };

    }, [view, page, search]);

    // =========================
    // FETCH PATIENT DETAILS
    // =========================

    useEffect(() => {
        if (!selectedPatient) {
            setPatientDetails(null);
            return;
        }

        const fetchPatientDetails = async () => {
            try {
                const response = await fetch(
                    `http://localhost:5000/api/patients/${selectedPatient}`
                );

                if (!response.ok) {
                    throw new Error(
                        "Failed to fetch patient details"
                    );
                }

                const data = await response.json();

                setPatientDetails(data);
            } catch (err) {
                console.error(err);
                setError("Failed to load patient details");
            }
        };

        fetchPatientDetails();
    }, [selectedPatient]);

    // =========================
    // FETCH CLINICS
    // =========================

    useEffect(() => {
        if (view !== "clinics") return;

        let cancelled = false;

        const fetchClinics = async () => {
            try {
                setLoading(true);
                setError("");

                const response = await fetch(
                    `http://localhost:5000/api/clinics?page=${clinicPage}&limit=20&search=${encodeURIComponent(
                        clinicSearch
                    )}`
                );

                if (!response.ok) {
                    throw new Error("Failed to fetch clinics");
                }

                const data = await response.json();

                if (cancelled) return;

                setClinics(data.clinics);
                setClinicTotalPages(data.totalPages);
            } catch (err) {
                console.error(err);
                setError("Failed to load clinics");
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchClinics();

        return () => {
            cancelled = true;
        };

    }, [view, clinicPage, clinicSearch]);

    // =========================
    // FETCH CLINIC DETAILS
    // =========================

    useEffect(() => {
        if (!selectedClinic) {
            setClinicDetails(null);
            return;
        }

        const fetchClinicDetails = async () => {
            try {
                const response = await fetch(
                    `http://localhost:5000/api/clinics/${selectedClinic}`
                );

                if (!response.ok) {
                    throw new Error(
                        "Failed to fetch clinic details"
                    );
                }

                const data = await response.json();

                setClinicDetails(data);
            } catch (err) {
                console.error(err);
                setError("Failed to load clinic details");
            }
        };

        fetchClinicDetails();
    }, [selectedClinic]);

    // =========================
    // FETCH APPOINTMENTS
    // =========================

    useEffect(() => {
        if (view !== "appointments") return;

        let cancelled = false;

        const fetchAppointments = async () => {
            try {
                setLoading(true);
                setError("");

                const url =
                    `http://localhost:5000/api/appointments` +
                    `?page=${appointmentPage}` +
                    `&limit=20` +
                    `&status=${encodeURIComponent(
                        appointmentStatus
                    )}` +
                    `&search=${encodeURIComponent(
                        appointmentSearch
                    )}`;

                const response = await fetch(url);

                if (!response.ok) {
                    throw new Error(
                        "Failed to fetch appointments"
                    );
                }

                const data = await response.json();

                if (cancelled) return;

                setAppointments(data.appointments);
                setAppointmentTotalPages(data.totalPages);
            } catch (err) {
                console.error(err);
                setError("Failed to load appointments");
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchAppointments();

        return () => {
            cancelled = true;
        };

    }, [
        view,
        appointmentPage,
        appointmentStatus,
        appointmentSearch
    ]);

    // =========================
    // FETCH APPOINTMENT DETAILS
    // =========================

    useEffect(() => {
        if (!selectedAppointment) {
            setAppointmentDetails(null);
            return;
        }

        const fetchAppointmentDetails = async () => {
            try {
                const response = await fetch(
                    `http://localhost:5000/api/appointments/${selectedAppointment}`
                );

                if (!response.ok) {
                    throw new Error(
                        "Failed to fetch appointment details"
                    );
                }

                const data = await response.json();

                setAppointmentDetails(data);
            } catch (err) {
                console.error(err);
                setError(
                    "Failed to load appointment details"
                );
            }
        };

        fetchAppointmentDetails();
    }, [selectedAppointment]);

    // =========================
    // FETCH BOOKING DATA
    // =========================

    useEffect(() => {
        if (view !== "booking") return;

        const fetchBookingData = async () => {
            try {
                setBookingLoading(true);
                setBookingError("");

                const [
                    patientsResponse,
                    clinicsResponse
                ] = await Promise.all([
                    fetch(
                        "http://localhost:5000/api/patients?page=1&limit=5000"
                    ),
                    fetch(
                        "http://localhost:5000/api/clinics?page=1&limit=500"
                    )
                ]);

                if (!patientsResponse.ok) {
                    throw new Error(
                        "Failed to load patients"
                    );
                }

                if (!clinicsResponse.ok) {
                    throw new Error(
                        "Failed to load clinics"
                    );
                }

                const patientsData =
                    await patientsResponse.json();

                const clinicsData =
                    await clinicsResponse.json();

                setBookingPatients(
                    patientsData.patients
                );

                setBookingClinics(
                    clinicsData.clinics
                );
            } catch (err) {
                console.error(err);
                setBookingError(
                    "Failed to load booking data"
                );
            } finally {
                setBookingLoading(false);
            }
        };

        fetchBookingData();
    }, [view]);

    // =========================
    // FETCH AUDIT PATIENTS
    // =========================

    useEffect(() => {
        if (view !== "audit") return;

        const fetchAuditPatients = async () => {
            try {
                setAuditLoading(true);
                setAuditError("");

                const response = await fetch(
                    "http://localhost:5000/api/patients?page=1&limit=5000"
                );

                if (!response.ok) {
                    throw new Error(
                        "Failed to load patients"
                    );
                }

                const data = await response.json();

                setAuditPatients(data.patients);
            } catch (err) {
                console.error(err);
                setAuditError(
                    "Failed to load patients"
                );
            } finally {
                setAuditLoading(false);
            }
        };

        fetchAuditPatients();
    }, [view]);


    //new BLOCK 
    // LIVE SEARCH (runs 300ms after you stop typing)

    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(1);
            setSearch(searchInput);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchInput]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setClinicPage(1);
            setClinicSearch(clinicSearchInput);
        }, 300);
        return () => clearTimeout(timer);
    }, [clinicSearchInput]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setAppointmentPage(1);
            setAppointmentSearch(appointmentSearchInput);
        }, 300);
        return () => clearTimeout(timer);
    }, [appointmentSearchInput]);

    // Full-screen loader is only for the very first load
    useEffect(() => {
        if (!loading) setInitialLoadDone(true);
    }, [loading]);

    // =========================
    // PATIENT SEARCH
    // =========================

    const handlePatientSearch = () => {
        setPage(1);
        setSearch(searchInput);
    };

    // =========================
    // CLINIC SEARCH
    // =========================

    const handleClinicSearch = () => {
        setClinicPage(1);
        setClinicSearch(clinicSearchInput);
    };

    // =========================
    // APPOINTMENT SEARCH
    // =========================

    const handleAppointmentSearch = () => {
        setAppointmentPage(1);
        setAppointmentSearch(
            appointmentSearchInput
        );
    };

    // =========================
    // APPOINTMENT STATUS FILTER
    // =========================

    const handleAppointmentStatusChange = (e) => {
        setAppointmentPage(1);
        setAppointmentStatus(e.target.value);
    };

    // =========================
    // UPDATE APPOINTMENT STATUS
    // =========================

    const updateAppointmentStatus = async (
        appointmentId,
        newStatus
    ) => {
        try {
            setError("");

            const response = await fetch(
                `http://localhost:5000/api/appointments/${appointmentId}/status`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    body: JSON.stringify({
                        status: newStatus
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    "Failed to update appointment"
                );
            }

            const refreshResponse = await fetch(
                `http://localhost:5000/api/appointments` +
                `?page=${appointmentPage}` +
                `&limit=20` +
                `&status=${encodeURIComponent(
                    appointmentStatus
                )}` +
                `&search=${encodeURIComponent(
                    appointmentSearch
                )}`
            );

            const refreshData =
                await refreshResponse.json();

            setAppointments(
                refreshData.appointments
            );

            setAppointmentTotalPages(
                refreshData.totalPages
            );

            if (
                selectedAppointment ===
                appointmentId
            ) {
                const detailsResponse =
                    await fetch(
                        `http://localhost:5000/api/appointments/${appointmentId}`
                    );

                if (detailsResponse.ok) {
                    const detailsData =
                        await detailsResponse.json();

                    setAppointmentDetails(
                        detailsData
                    );
                }
            }
        } catch (err) {
            console.error(err);
            setError(err.message);
        }
    };

    // =========================
    // BOOK APPOINTMENT
    // =========================

    const handleBooking = async () => {
        try {
            setBookingError("");
            setBookingResult(null);

            if (!bookingPatientId) {
                setBookingError(
                    "Please select a patient"
                );
                return;
            }

            if (!bookingClinicId) {
                setBookingError(
                    "Please select a clinic"
                );
                return;
            }

            if (
                bookingCopay === "" ||
                Number(bookingCopay) < 0
            ) {
                setBookingError(
                    "Please enter a valid copay amount"
                );
                return;
            }

            setBookingLoading(true);

            const response = await fetch(
                "http://localhost:5000/api/bookings",
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    body: JSON.stringify({
                        patient_id:
                            bookingPatientId,
                        clinic_id:
                            bookingClinicId,
                        copay_amount:
                            Number(bookingCopay)
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    "Failed to book appointment"
                );
            }

            setBookingResult(data);

            setBookingPatientId("");
            setBookingClinicId("");
            setBookingCopay("");
        } catch (err) {
            console.error(err);

            setBookingError(err.message);
        } finally {
            setBookingLoading(false);
        }
    };

    // =========================
    // LOAD AUDIT TRAIL
    // =========================

    const loadAuditTrail = async () => {
        try {
            setAuditError("");
            setAuditLogs([]);

            if (!auditPatientId) {
                setAuditError(
                    "Please select a patient"
                );
                return;
            }

            setAuditLoading(true);

            let url =
                `http://localhost:5000/api/audit-logs/${auditPatientId}`;

            const params = new URLSearchParams();

            if (auditFrom) {
                params.append(
                    "from",
                    `${auditFrom}T00:00:00`
                );
            }

            if (auditTo) {
                params.append(
                    "to",
                    `${auditTo}T23:59:59`
                );
            }

            if (params.toString()) {
                url += `?${params.toString()}`;
            }

            const response = await fetch(url);

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    "Failed to load audit trail"
                );
            }

            setAuditLogs(data.logs);
        } catch (err) {
            console.error(err);

            setAuditError(
                err.message
            );
        } finally {
            setAuditLoading(false);
        }
    };

    // =========================
    // NAVIGATION
    // =========================

    const showPatients = () => {
        setView("patients");
        setSelectedPatient(null);
        setSelectedClinic(null);
        setSelectedAppointment(null);
        setError("");
    };

    const showClinics = () => {
        setView("clinics");
        setSelectedPatient(null);
        setSelectedClinic(null);
        setSelectedAppointment(null);
        setError("");
    };

    const showAppointments = () => {
        setView("appointments");
        setSelectedPatient(null);
        setSelectedClinic(null);
        setSelectedAppointment(null);
        setError("");
    };

    const showBooking = () => {
        setView("booking");
        setSelectedPatient(null);
        setSelectedClinic(null);
        setSelectedAppointment(null);
        setError("");
        setBookingError("");
        setBookingResult(null);
    };

    const showAudit = () => {
        setView("audit");
        setSelectedPatient(null);
        setSelectedClinic(null);
        setSelectedAppointment(null);
        setError("");
        setAuditError("");
    };

    // =========================
    // LOADING
    // =========================

    if (loading && !initialLoadDone) {
        return (
            <div className="loading">
                Loading CareConnect...
            </div>
        );
    }

    // =========================
    // MAIN UI
    // =========================

    return (
        <div className="app-container">

            {/* HEADER */}

            <div className="header">

                <h1>CareConnect</h1>

                <p>
                    On-Demand Telemedicine Platform
                </p>

                <div className="navigation">

                    <button
                        className={
                            view === "patients"
                                ? "nav-button active"
                                : "nav-button"
                        }
                        onClick={showPatients}
                    >
                        Patients
                    </button>

                    <button
                        className={
                            view === "clinics"
                                ? "nav-button active"
                                : "nav-button"
                        }
                        onClick={showClinics}
                    >
                        Clinics
                    </button>

                    <button
                        className={
                            view === "appointments"
                                ? "nav-button active"
                                : "nav-button"
                        }
                        onClick={showAppointments}
                    >
                        Appointments
                    </button>

                    <button
                        className={
                            view === "booking"
                                ? "nav-button active"
                                : "nav-button"
                        }
                        onClick={showBooking}
                    >
                        Book Appointment
                    </button>

                    <button
                        className={
                            view === "audit"
                                ? "nav-button active"
                                : "nav-button"
                        }
                        onClick={showAudit}
                    >
                        Audit Trail
                    </button>

                    <button
                        className={`nav-button ${view === "analytics" ? "active" : ""}`}
                        onClick={() => setView("analytics")}
                    >
                        Analytics
                    </button>

                    <button
                        className={`nav-button ${view === "reviews" ? "active" : ""}`}
                        onClick={() => setView("reviews")}
                    >
                        Reviews
                    </button>


                    <button
                        className={`nav-button ${view === "map" ? "active" : ""}`}
                        onClick={() => setView("map")}
                    >
                        Map
                    </button>



                </div>
            </div>

            {/* GENERAL ERROR */}

            {error && (
                <div className="error">
                    {error}
                </div>
            )}

            {/* ================================================= */}
            {/* PATIENTS */}
            {/* ================================================= */}

            {view === "patients" && (
                <div className="section">

                    <h2>Patients</h2>

                    <div className="search-container">

                        <input
                            className="search-input"
                            type="text"
                            placeholder="Search patients..."
                            value={searchInput}
                            onChange={(e) =>
                                setSearchInput(
                                    e.target.value
                                )
                            }
                            onKeyDown={(e) => {
                                if (
                                    e.key === "Enter"
                                ) {
                                    handlePatientSearch();
                                }
                            }}
                        />

                        <button
                            onClick={
                                handlePatientSearch
                            }
                        >
                            Search
                        </button>

                    </div>

                    {!loading && patients.length === 0 ? (
                        <div className="empty">
                            No patients found.
                        </div>
                    ) : (
                        <table className="patient-table">

                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>
                                        HSA Balance
                                    </th>
                                </tr>
                            </thead>

                            <tbody>

                                {patients.map(
                                    (patient) => (
                                        <tr
                                            key={
                                                patient.id
                                            }
                                        >

                                            <td>
                                                <button
                                                    className="patient-name-button"
                                                    onClick={() =>
                                                        setSelectedPatient(
                                                            patient.id
                                                        )
                                                    }
                                                >
                                                    {
                                                        patient.name
                                                    }
                                                </button>
                                            </td>

                                            <td>
                                                $
                                                {Number(
                                                    patient.hsa_balance
                                                ).toFixed(
                                                    2
                                                )}
                                            </td>

                                        </tr>
                                    )
                                )}

                            </tbody>

                        </table>
                    )}

                    <div className="pagination">

                        <button
                            disabled={page <= 1}
                            onClick={() => {
                                setPage(
                                    page - 1
                                );
                                setSelectedPatient(
                                    null
                                );
                            }}
                        >
                            Previous
                        </button>

                        <span className="page-number">
                            Page {page} of{" "}
                            {totalPages}
                        </span>

                        <button
                            disabled={
                                page >=
                                totalPages
                            }
                            onClick={() => {
                                setPage(
                                    page + 1
                                );
                                setSelectedPatient(
                                    null
                                );
                            }}
                        >
                            Next
                        </button>

                    </div>

                    {patientDetails && (
                        <div className="patient-details">

                            <h2>
                                Patient Details
                            </h2>

                            <div className="patient-detail-row">
                                <strong>
                                    Name:
                                </strong>{" "}
                                {
                                    patientDetails.name
                                }
                            </div>

                            <div className="patient-detail-row">
                                <strong>
                                    HSA Balance:
                                </strong>{" "}
                                $
                                {Number(
                                    patientDetails.hsa_balance
                                ).toFixed(2)}
                            </div>

                            <div className="patient-detail-row">
                                <strong>
                                    ID:
                                </strong>{" "}
                                {
                                    patientDetails.id
                                }
                            </div>

                        </div>
                    )}

                </div>
            )}

            {/* ================================================= */}
            {/* CLINICS */}
            {/* ================================================= */}

            {view === "clinics" && (
                <div className="section">

                    <h2>Clinics</h2>

                    <div className="search-container">

                        <input
                            className="search-input"
                            type="text"
                            placeholder="Search clinics..."
                            value={
                                clinicSearchInput
                            }
                            onChange={(e) =>
                                setClinicSearchInput(
                                    e.target.value
                                )
                            }
                            onKeyDown={(e) => {
                                if (
                                    e.key === "Enter"
                                ) {
                                    handleClinicSearch();
                                }
                            }}
                        />

                        <button
                            onClick={
                                handleClinicSearch
                            }
                        >
                            Search
                        </button>

                    </div>

                    {!loading && clinics.length === 0 ? (
                        <div className="empty">
                            No clinics found.
                        </div>
                    ) : (
                        <table className="patient-table">

                            <thead>

                                <tr>
                                    <th>Name</th>
                                    <th>
                                        Latitude
                                    </th>
                                    <th>
                                        Longitude
                                    </th>
                                    <th>
                                        Accepting
                                        Patients
                                    </th>
                                </tr>

                            </thead>

                            <tbody>

                                {clinics.map(
                                    (clinic) => (
                                        <tr
                                            key={
                                                clinic.id
                                            }
                                        >

                                            <td>
                                                <button
                                                    className="patient-name-button"
                                                    onClick={() =>
                                                        setSelectedClinic(
                                                            clinic.id
                                                        )
                                                    }
                                                >
                                                    {
                                                        clinic.name
                                                    }
                                                </button>
                                            </td>

                                            <td>
                                                {
                                                    clinic.latitude
                                                }
                                            </td>

                                            <td>
                                                {
                                                    clinic.longitude
                                                }
                                            </td>

                                            <td>
                                                <YesNoBadge
                                                    value={clinic.is_accepting_patients}
                                                />
                                            </td>

                                        </tr>
                                    )
                                )}

                            </tbody>

                        </table>
                    )}

                    <div className="pagination">

                        <button
                            disabled={
                                clinicPage <= 1
                            }
                            onClick={() => {
                                setClinicPage(
                                    clinicPage - 1
                                );
                                setSelectedClinic(
                                    null
                                );
                            }}
                        >
                            Previous
                        </button>

                        <span className="page-number">
                            Page {clinicPage} of{" "}
                            {
                                clinicTotalPages
                            }
                        </span>

                        <button
                            disabled={
                                clinicPage >=
                                clinicTotalPages
                            }
                            onClick={() => {
                                setClinicPage(
                                    clinicPage + 1
                                );
                                setSelectedClinic(
                                    null
                                );
                            }}
                        >
                            Next
                        </button>

                    </div>

                    {clinicDetails && (
                        <div className="patient-details">

                            <h2>
                                Clinic Details
                            </h2>

                            <div className="patient-detail-row">
                                <strong>
                                    Name:
                                </strong>{" "}
                                {
                                    clinicDetails.name
                                }
                            </div>

                            <div className="patient-detail-row">
                                <strong>
                                    Latitude:
                                </strong>{" "}
                                {
                                    clinicDetails.latitude
                                }
                            </div>

                            <div className="patient-detail-row">
                                <strong>
                                    Longitude:
                                </strong>{" "}
                                {
                                    clinicDetails.longitude
                                }
                            </div>

                            <div className="patient-detail-row">
                                <strong>
                                    Accepting
                                    Patients:
                                </strong>{" "}
                                <YesNoBadge
                                    value={clinicDetails.is_accepting_patients}
                                />
                            </div>

                            <div className="patient-detail-row">
                                <strong>
                                    ID:
                                </strong>{" "}
                                {
                                    clinicDetails.id
                                }
                            </div>

                        </div>
                    )}

                </div>
            )}

            {/* ================================================= */}
            {/* APPOINTMENTS */}
            {/* ================================================= */}

            {view === "appointments" && (
                <div className="section">

                    <h2>Appointments</h2>

                    <div className="search-container">

                        <input
                            className="search-input"
                            type="text"
                            placeholder="Search patient or clinic..."
                            value={
                                appointmentSearchInput
                            }
                            onChange={(e) =>
                                setAppointmentSearchInput(
                                    e.target.value
                                )
                            }
                            onKeyDown={(e) => {
                                if (
                                    e.key === "Enter"
                                ) {
                                    handleAppointmentSearch();
                                }
                            }}
                        />

                        <button
                            onClick={
                                handleAppointmentSearch
                            }
                        >
                            Search
                        </button>

                        <select
                            className="search-input"
                            value={
                                appointmentStatus
                            }
                            onChange={
                                handleAppointmentStatusChange
                            }
                        >
                            <option value="">
                                All Statuses
                            </option>

                            <option value="WAITING">
                                Waiting
                            </option>

                            <option value="IN_CONSULTATION">
                                In Consultation
                            </option>

                            <option value="DISCHARGED">
                                Discharged
                            </option>

                        </select>

                    </div>

                    {!loading && appointments.length === 0 ? (
                        <div className="empty">
                            No appointments found.
                        </div>
                    ) : (
                        <table className="patient-table">

                            <thead>

                                <tr>
                                    <th>
                                        Patient
                                    </th>
                                    <th>
                                        Clinic
                                    </th>
                                    <th>
                                        Copay
                                    </th>
                                    <th>
                                        Status
                                    </th>
                                    <th>
                                        Created
                                    </th>
                                    <th>
                                        Action
                                    </th>
                                </tr>

                            </thead>

                            <tbody>

                                {appointments.map(
                                    (
                                        appointment
                                    ) => (
                                        <tr
                                            key={
                                                appointment.id
                                            }
                                        >

                                            <td>
                                                <button
                                                    className="patient-name-button"
                                                    onClick={() =>
                                                        setSelectedAppointment(
                                                            appointment.id
                                                        )
                                                    }
                                                >
                                                    {
                                                        appointment.patient_name
                                                    }
                                                </button>
                                            </td>

                                            <td>
                                                {
                                                    appointment.clinic_name
                                                }
                                            </td>

                                            <td>
                                                $
                                                {Number(
                                                    appointment.copay_amount
                                                ).toFixed(
                                                    2
                                                )}
                                            </td>

                                            <td>
                                                <StatusBadge
                                                    status={appointment.status}
                                                />
                                            </td>

                                            <td>
                                                {new Date(
                                                    appointment.created_at
                                                ).toLocaleString()}
                                            </td>

                                            <td>

                                                {appointment.status ===
                                                    "WAITING" && (
                                                    <button
                                                        className="btn-small"
                                                        onClick={() =>
                                                            updateAppointmentStatus(
                                                                appointment.id,
                                                                "IN_CONSULTATION"
                                                            )
                                                        }
                                                    >
                                                        Start Consultation
                                                    </button>
                                                )}

                                                {appointment.status ===
                                                    "IN_CONSULTATION" && (
                                                    <button
                                                        className="btn-small btn-success"
                                                        onClick={() =>
                                                            updateAppointmentStatus(
                                                                appointment.id,
                                                                "DISCHARGED"
                                                            )
                                                        }
                                                    >
                                                        Discharge
                                                    </button>
                                                )}

                                                {appointment.status ===
                                                    "DISCHARGED" && (
                                                    <span className="muted">
                                                        Completed
                                                    </span>
                                                )}

                                            </td>

                                        </tr>
                                    )
                                )}

                            </tbody>

                        </table>
                    )}

                    <div className="pagination">

                        <button
                            disabled={
                                appointmentPage <=
                                1
                            }
                            onClick={() => {
                                setAppointmentPage(
                                    appointmentPage -
                                    1
                                );
                                setSelectedAppointment(
                                    null
                                );
                            }}
                        >
                            Previous
                        </button>

                        <span className="page-number">
                            Page{" "}
                            {
                                appointmentPage
                            }{" "}
                            of{" "}
                            {
                                appointmentTotalPages
                            }
                        </span>

                        <button
                            disabled={
                                appointmentPage >=
                                appointmentTotalPages
                            }
                            onClick={() => {
                                setAppointmentPage(
                                    appointmentPage +
                                    1
                                );
                                setSelectedAppointment(
                                    null
                                );
                            }}
                        >
                            Next
                        </button>

                    </div>

                    {appointmentDetails && (
                        <div className="patient-details">

                            <h2>
                                Appointment Details
                            </h2>

                            <div className="patient-detail-row">
                                <strong>
                                    Patient:
                                </strong>{" "}
                                {
                                    appointmentDetails.patient_name
                                }
                            </div>

                            <div className="patient-detail-row">
                                <strong>
                                    Clinic:
                                </strong>{" "}
                                {
                                    appointmentDetails.clinic_name
                                }
                            </div>

                            <div className="patient-detail-row">
                                <strong>
                                    Copay:
                                </strong>{" "}
                                $
                                {Number(
                                    appointmentDetails.copay_amount
                                ).toFixed(2)}
                            </div>

                            <div className="patient-detail-row">
                                <strong>
                                    Status:
                                </strong>{" "}
                                <StatusBadge
                                    status={appointmentDetails.status}
                                />
                            </div>

                            <div className="patient-detail-row">
                                <strong>
                                    Created:
                                </strong>{" "}
                                {new Date(
                                    appointmentDetails.created_at
                                ).toLocaleString()}
                            </div>

                            <div className="patient-detail-row">
                                <strong>
                                    Appointment ID:
                                </strong>{" "}
                                {
                                    appointmentDetails.id
                                }
                            </div>

                        </div>
                    )}

                </div>
            )}

            {/* ================================================= */}
            {/* BOOK APPOINTMENT */}
            {/* ================================================= */}

            {view === "booking" && (
                <div className="section">

                    <h2>Book Appointment</h2>

                    <p>
                        Create a new appointment using
                        the CareConnect booking procedure.
                    </p>

                    {bookingError && (
                        <div className="error">
                            {bookingError}
                        </div>
                    )}

                    {bookingLoading ? (
                        <div className="empty">
                            Loading...
                        </div>
                    ) : (
                        <>

                            <div
                                style={{
                                    marginBottom: "20px"
                                }}
                            >

                                <label>
                                    <strong>
                                        Patient
                                    </strong>
                                </label>

                                <br />

                                <select
                                    className="search-input"
                                    value={
                                        bookingPatientId
                                    }
                                    onChange={(e) =>
                                        setBookingPatientId(
                                            e.target.value
                                        )
                                    }
                                    style={{
                                        marginTop: "8px",
                                        width: "100%"
                                    }}
                                >

                                    <option value="">
                                        Select a patient
                                    </option>

                                    {bookingPatients.map(
                                        (patient) => (
                                            <option
                                                key={
                                                    patient.id
                                                }
                                                value={
                                                    patient.id
                                                }
                                            >
                                                {patient.name}
                                                {" — HSA $"}
                                                {Number(
                                                    patient.hsa_balance
                                                ).toFixed(
                                                    2
                                                )}
                                            </option>
                                        )
                                    )}

                                </select>

                            </div>

                            <div
                                style={{
                                    marginBottom: "20px"
                                }}
                            >

                                <label>
                                    <strong>
                                        Clinic
                                    </strong>
                                </label>

                                <br />

                                <select
                                    className="search-input"
                                    value={
                                        bookingClinicId
                                    }
                                    onChange={(e) =>
                                        setBookingClinicId(
                                            e.target.value
                                        )
                                    }
                                    style={{
                                        marginTop: "8px",
                                        width: "100%"
                                    }}
                                >

                                    <option value="">
                                        Select a clinic
                                    </option>

                                    {bookingClinics.map(
                                        (clinic) => (
                                            <option
                                                key={
                                                    clinic.id
                                                }
                                                value={
                                                    clinic.id
                                                }
                                            >
                                                {
                                                    clinic.name
                                                }
                                                {" — "}
                                                {
                                                    clinic.is_accepting_patients
                                                        ? "Accepting patients"
                                                        : "Not accepting patients"
                                                }
                                            </option>
                                        )
                                    )}

                                </select>

                            </div>

                            <div
                                style={{
                                    marginBottom: "25px"
                                }}
                            >

                                <label>
                                    <strong>
                                        Copay Amount
                                    </strong>
                                </label>

                                <br />

                                <input
                                    className="search-input"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="Enter copay amount"
                                    value={
                                        bookingCopay
                                    }
                                    onChange={(e) =>
                                        setBookingCopay(
                                            e.target.value
                                        )
                                    }
                                    style={{
                                        marginTop: "8px",
                                        width: "100%"
                                    }}
                                />

                            </div>

                            <button
                                onClick={
                                    handleBooking
                                }
                                disabled={
                                    bookingLoading
                                }
                            >
                                Book Appointment
                            </button>

                        </>
                    )}

                    {bookingResult && (
                        <div
                            className="patient-details booking-result"
                            style={{
                                marginTop: "30px"
                            }}
                        >

                            <h2>
                                Appointment Booked Successfully
                            </h2>

                            <div className="patient-detail-row">
                                <strong>
                                    Message:
                                </strong>{" "}
                                {
                                    bookingResult.message
                                }
                            </div>

                            <hr />

                            <h3>
                                HSA Balance
                            </h3>

                            <div className="patient-detail-row">
                                <strong>
                                    Before:
                                </strong>{" "}
                                $
                                {Number(
                                    bookingResult.hsa.before
                                ).toFixed(2)}
                            </div>

                            <div className="patient-detail-row">
                                <strong>
                                    Amount Charged:
                                </strong>{" "}
                                $
                                {Number(
                                    bookingResult.hsa.amount_charged
                                ).toFixed(2)}
                            </div>

                            <div className="patient-detail-row">
                                <strong>
                                    After:
                                </strong>{" "}
                                $
                                {Number(
                                    bookingResult.hsa.after
                                ).toFixed(2)}
                            </div>

                            <hr />

                            <h3>
                                New Appointment
                            </h3>

                            <div className="patient-detail-row">
                                <strong>
                                    Patient:
                                </strong>{" "}
                                {
                                    bookingResult
                                        .appointment
                                        .patient_name
                                }
                            </div>

                            <div className="patient-detail-row">
                                <strong>
                                    Clinic:
                                </strong>{" "}
                                {
                                    bookingResult
                                        .appointment
                                        .clinic_name
                                }
                            </div>

                            <div className="patient-detail-row">
                                <strong>
                                    Copay:
                                </strong>{" "}
                                $
                                {Number(
                                    bookingResult
                                        .appointment
                                        .copay_amount
                                ).toFixed(2)}
                            </div>

                            <div className="patient-detail-row">
                                <strong>
                                    Status:
                                </strong>{" "}
                                <StatusBadge
                                    status={bookingResult.appointment.status}
                                />
                            </div>

                            <div className="patient-detail-row">
                                <strong>
                                    Appointment ID:
                                </strong>{" "}
                                {
                                    bookingResult
                                        .appointment
                                        .id
                                }
                            </div>

                            <hr />

                            <h3>
                                Wallet Audit Log
                            </h3>

                            <div className="patient-detail-row">
                                <strong>
                                    Action:
                                </strong>{" "}
                                {
                                    bookingResult
                                        .audit_log
                                        .action_type
                                }
                            </div>

                            <div className="patient-detail-row">
                                <strong>
                                    Amount Changed:
                                </strong>{" "}
                                $
                                {Number(
                                    bookingResult
                                        .audit_log
                                        .amount_changed
                                ).toFixed(2)}
                            </div>

                            <div className="patient-detail-row">
                                <strong>
                                    Balance After:
                                </strong>{" "}
                                $
                                {Number(
                                    bookingResult
                                        .audit_log
                                        .balance_after
                                ).toFixed(2)}
                            </div>

                            <div className="patient-detail-row">
                                <strong>
                                    Timestamp:
                                </strong>{" "}
                                {new Date(
                                    bookingResult
                                        .audit_log
                                        .timestamp
                                ).toLocaleString()}
                            </div>

                        </div>
                    )}

                </div>
            )}

            {/* ================================================= */}
            {/* AUDIT TRAIL */}
            {/* ================================================= */}

            {view === "audit" && (
                <div className="section">

                    <h2>Wallet Audit Trail</h2>

                    <p>
                        View HSA balance changes for a
                        selected patient.
                    </p>

                    {auditError && (
                        <div className="error">
                            {auditError}
                        </div>
                    )}

                    {auditLoading &&
                    auditPatients.length === 0 ? (
                        <div className="empty">
                            Loading patients...
                        </div>
                    ) : (
                        <>
                            {/* PATIENT */}

                            <div
                                style={{
                                    marginBottom:
                                        "20px"
                                }}
                            >

                                <label>
                                    <strong>
                                        Patient
                                    </strong>
                                </label>

                                <br />

                                <select
                                    className="search-input"
                                    value={
                                        auditPatientId
                                    }
                                    onChange={(e) =>
                                        setAuditPatientId(
                                            e.target.value
                                        )
                                    }
                                    style={{
                                        marginTop:
                                            "8px",
                                        width: "100%"
                                    }}
                                >

                                    <option value="">
                                        Select a patient
                                    </option>

                                    {auditPatients.map(
                                        (patient) => (
                                            <option
                                                key={
                                                    patient.id
                                                }
                                                value={
                                                    patient.id
                                                }
                                            >
                                                {
                                                    patient.name
                                                }
                                                {" — HSA $"}
                                                {Number(
                                                    patient.hsa_balance
                                                ).toFixed(
                                                    2
                                                )}
                                            </option>
                                        )
                                    )}

                                </select>

                            </div>

                            {/* DATE FILTER */}

                            <div
                                style={{
                                    display: "flex",
                                    gap: "15px",
                                    marginBottom:
                                        "25px",
                                    flexWrap:
                                        "wrap"
                                }}
                            >

                                <div>
                                    <label>
                                        <strong>
                                            From
                                        </strong>
                                    </label>

                                    <br />

                                    <input
                                        className="search-input"
                                        type="date"
                                        value={
                                            auditFrom
                                        }
                                        onChange={(e) =>
                                            setAuditFrom(
                                                e.target
                                                    .value
                                            )
                                        }
                                        style={{
                                            marginTop:
                                                "8px"
                                        }}
                                    />
                                </div>

                                <div>
                                    <label>
                                        <strong>
                                            To
                                        </strong>
                                    </label>

                                    <br />

                                    <input
                                        className="search-input"
                                        type="date"
                                        value={
                                            auditTo
                                        }
                                        onChange={(e) =>
                                            setAuditTo(
                                                e.target
                                                    .value
                                            )
                                        }
                                        style={{
                                            marginTop:
                                                "8px"
                                        }}
                                    />
                                </div>

                            </div>

                            <button
                                onClick={
                                    loadAuditTrail
                                }
                                disabled={
                                    auditLoading
                                }
                            >
                                {auditLoading
                                    ? "Loading..."
                                    : "Load Audit Trail"}
                            </button>

                        </>
                    )}

                    {/* AUDIT TABLE */}

                    {auditLogs.length > 0 && (
                        <div
                            style={{
                                marginTop:
                                    "30px"
                            }}
                        >

                            <h3>
                                Audit Records
                            </h3>

                            <table className="patient-table">

                                <thead>

                                    <tr>
                                        <th>
                                            Timestamp
                                        </th>

                                        <th>
                                            Action
                                        </th>

                                        <th>
                                            Amount Changed
                                        </th>

                                        <th>
                                            Balance After
                                        </th>

                                        <th>
                                            Running Change
                                        </th>
                                    </tr>

                                </thead>

                                <tbody>

                                    {auditLogs.map(
                                        (log) => (
                                            <tr
                                                key={
                                                    log.id
                                                }
                                            >

                                                <td>
                                                    {new Date(
                                                        log.timestamp
                                                    ).toLocaleString()}
                                                </td>

                                                <td>
                                                    {
                                                        log.action_type
                                                    }
                                                </td>

                                                <td>
                                                    $
                                                    {Number(
                                                        log.amount_changed
                                                    ).toFixed(
                                                        2
                                                    )}
                                                </td>

                                                <td>
                                                    $
                                                    {Number(
                                                        log.balance_after
                                                    ).toFixed(
                                                        2
                                                    )}
                                                </td>

                                                <td>
                                                    $
                                                    {Number(
                                                        log.running_change
                                                    ).toFixed(
                                                        2
                                                    )}
                                                </td>

                                            </tr>
                                        )
                                    )}

                                </tbody>

                            </table>

                        </div>
                    )}

                    {/* NO RESULTS */}

                    {!auditLoading &&
                        auditPatientId &&
                        auditLogs.length === 0 && (
                            <div
                                className="empty"
                                style={{
                                    marginTop:
                                        "30px"
                                }}
                            >
                                No audit records found
                                for the selected
                                patient/date range.
                            </div>
                        )}

                </div>
            )}
{view === "analytics" && (
    <div className="section">
        <h2>Clinic Revenue Analytics</h2>
        <p>
            Revenue trends from the window-function query, clinic
            rankings from DENSE_RANK(), and discharge totals from the
            materialized view.
        </p>

        {/* ================================================= */}
        {/* 1. 7-DAY MOVING AVERAGE CHART (window function)   */}
        {/* ================================================= */}

        {analyticsError && (
            <div className="error">
                {analyticsError}
            </div>
        )}

        {analyticsLoading && (
            <div className="empty">
                Loading analytics...
            </div>
        )}

        {!analyticsLoading &&
            !analyticsError &&
            analyticsData.length === 0 && (
                <div className="empty">
                    No analytics data available.
                </div>
            )}

        {!analyticsLoading &&
            !analyticsError &&
            analyticsData.length > 0 && (() => {
                const latestDate = analyticsData.reduce(
                    (latest, item) =>
                        toDateKey(item.revenue_date) > latest
                            ? toDateKey(item.revenue_date)
                            : latest,
                    toDateKey(analyticsData[0].revenue_date)
                );

                const rankedRows = analyticsData
                    .filter(
                        (row) =>
                            toDateKey(row.revenue_date) === latestDate
                    )
                    .sort(
                        (a, b) =>
                            Number(a.clinic_rank) -
                                Number(b.clinic_rank) ||
                            String(a.clinic_name).localeCompare(
                                String(b.clinic_name)
                            )
                    );

                // Every clinic for the chart selector. Until one is
                // picked (or if it disappears after a reload), show
                // the #1-ranked clinic for the latest day.
                const chartClinics = getRevenueClinics(analyticsData);
                const chartClinic = chartClinics.some(
                    (c) => c.id === chartClinicId
                )
                    ? chartClinicId
                    : String(rankedRows[0]?.clinic_id ?? chartClinics[0]?.id ?? "");

                return (
                    <>
                        <div className="analytics-header">
                            <div>
                                <h3>7-Day Moving Average Revenue</h3>
                                <p>
                                    Average daily revenue over a rolling
                                    7-day window, per clinic. Choose a
                                    clinic to view its trend; the dashed
                                    line is its raw daily revenue. Hover
                                    a point for its value.
                                </p>
                            </div>

                            <label className="chart-filter">
                                Clinic
                                <select
                                    value={chartClinic}
                                    onChange={(e) =>
                                        setChartClinicId(e.target.value)
                                    }
                                >
                                    {chartClinics.map((clinic) => (
                                        <option
                                            key={clinic.id}
                                            value={clinic.id}
                                        >
                                            {clinic.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <MovingAverageChart
                            rows={analyticsData}
                            selectedClinicId={chartClinic}
                        />

                        {/* ================================================= */}
                        {/* 2. RANKED TABLE (DENSE_RANK)                      */}
                        {/* ================================================= */}

                        <div className="analytics-header">
                            <div>
                                <h3>Clinic Revenue Ranking</h3>
                                <p>
                                    Ranked with DENSE_RANK() for{" "}
                                    <strong>
                                        {formatDateKey(latestDate, {
                                            month: "long",
                                            day: "numeric",
                                            year: "numeric"
                                        })}
                                    </strong>
                                    . Clinics with equal revenue share a
                                    rank, and the next rank is not skipped.
                                </p>
                            </div>
                        </div>

                        <div className="analytics-table-container">
                            <table className="patient-table">
                                <thead>
                                    <tr>
                                        <th>Rank</th>
                                        <th>Clinic</th>
                                        <th>Date</th>
                                        <th>Daily Revenue</th>
                                        <th>7-Day Average</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {rankedRows.map((row) => (
                                        <tr key={row.clinic_id}>
                                            <td>
                                                <span className="rank-badge">
                                                    #{row.clinic_rank}
                                                </span>
                                            </td>

                                            <td>
                                                {row.clinic_name}
                                            </td>

                                            <td>
                                                {formatDateKey(
                                                    toDateKey(row.revenue_date),
                                                    {
                                                        month: "short",
                                                        day: "numeric",
                                                        year: "numeric"
                                                    }
                                                )}
                                            </td>

                                            <td>
                                                {formatMoney(row.daily_revenue)}
                                            </td>

                                            <td>
                                                <strong>
                                                    {formatMoney(
                                                        row.moving_7_day_average
                                                    )}
                                                </strong>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                );
            })()}

        {/* ================================================= */}
        {/* 3. MATERIALIZED VIEW SUMMARY + REFRESH            */}
        {/* ================================================= */}

        <div className="analytics-summary">
            <div className="analytics-header">
                <div>
                    <h3>Monthly Discharge Summary</h3>
                    <p>
                        Clinic discharge statistics from the
                        materialized view.
                    </p>
                    <p className="muted">
                        Last refreshed:{" "}
                        <strong>
                            {dischargeRefreshedAt
                                ? new Date(
                                    dischargeRefreshedAt.time
                                ).toLocaleString()
                                : "—"}
                        </strong>
                        {dischargeRefreshedAt &&
                            !dischargeRefreshedAt.fromServer &&
                            " (time loaded in this browser)"}
                    </p>
                </div>

                <button
                    onClick={refreshDischargeAnalytics}
                    disabled={dischargeLoading}
                >
                    {dischargeLoading
                        ? "Refreshing..."
                        : "Refresh Data"}
                </button>
            </div>

            {dischargeError && (
                <div className="error">
                    {dischargeError}
                </div>
            )}

            {dischargeLoading && dischargeData.length === 0 && (
                <div className="empty">
                    Loading discharge summary...
                </div>
            )}

            {!dischargeLoading &&
                !dischargeError &&
                dischargeData.length === 0 && (
                    <div className="empty">
                        No discharge data in the materialized view.
                    </div>
                )}

            {dischargeData.length > 0 && (() => {
                const latestMonth = dischargeData.reduce(
                    (latest, item) =>
                        item.discharge_month > latest
                            ? item.discharge_month
                            : latest,
                    dischargeData[0].discharge_month
                );

                const monthRows = dischargeData
                    .filter(
                        (item) => item.discharge_month === latestMonth
                    )
                    .sort(
                        (a, b) =>
                            Number(b.total_discharges) -
                            Number(a.total_discharges)
                    );

                const totalDischarges = monthRows.reduce(
                    (sum, item) => sum + Number(item.total_discharges || 0),
                    0
                );

                const allTimeDischarges = dischargeData.reduce(
                    (sum, item) => sum + Number(item.total_discharges || 0),
                    0
                );

                const topClinic = monthRows[0];

                const monthLabel = new Date(
                    latestMonth
                ).toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric"
                });

                return (
                    <>
                        <div className="stat-grid">
                            <div className="stat-tile">
                                <span className="stat-label">
                                    Discharges in {monthLabel}
                                </span>
                                <span className="stat-value">
                                    {totalDischarges.toLocaleString()}
                                </span>
                            </div>

                            <div className="stat-tile">
                                <span className="stat-label">
                                    Clinics with discharges
                                </span>
                                <span className="stat-value">
                                    {monthRows.length}
                                </span>
                            </div>

                            <div className="stat-tile">
                                <span className="stat-label">
                                    Top clinic this month
                                </span>
                                <span className="stat-value stat-value-text">
                                    {topClinic?.clinic_name ?? "—"}
                                </span>
                                {topClinic && (
                                    <span className="muted">
                                        {topClinic.total_discharges} discharges
                                    </span>
                                )}
                            </div>

                            <div className="stat-tile">
                                <span className="stat-label">
                                    All discharges in view
                                </span>
                                <span className="stat-value">
                                    {allTimeDischarges.toLocaleString()}
                                </span>
                            </div>
                        </div>

                        <div className="analytics-table-container">
                            <table className="patient-table">
                                <thead>
                                    <tr>
                                        <th>Clinic</th>
                                        <th>Month</th>
                                        <th>Total Discharges</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {monthRows.map((item) => (
                                        <tr key={item.clinic_id}>
                                            <td>{item.clinic_name}</td>
                                            <td>{monthLabel}</td>
                                            <td>
                                                <strong>
                                                    {item.total_discharges}
                                                </strong>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                );
            })()}
        </div>
    </div>
)}

{view === "reviews" && (
    <div className="section">
        <h2>Patient Reviews</h2>

        {reviewsLoading && (
            <div className="empty">Loading reviews...</div>
        )}

        {reviewsError && (
            <div className="error">{reviewsError}</div>
        )}

        {!reviewsLoading && !reviewsError && reviewData && (
            <>
                <div className="analytics-summary">
                    <h3>Overall Rating</h3>
                    <p>
                        Average rating:{" "}
                        <strong>
                            {reviewData.global_average?.[0]?.avg_rating ?? "N/A"}
                            {" / 5"}
                        </strong>
                    </p>
                    <p>
                        Total reviews:{" "}
                        <strong>
                            {reviewData.global_average?.[0]?.total_reviews ?? 0}
                        </strong>
                    </p>
                </div>

                <h3>Rating Distribution</h3>

                {reviewData.rating_buckets?.length > 0 ? (
                    <table className="patient-table">
                        <thead>
                            <tr>
                                <th>Rating</th>
                                <th>Number of Reviews</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reviewData.rating_buckets.map((item) => (
                                <tr key={item._id}>
                                    <td>{item._id} / 5</td>
                                    <td>{item.count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="empty">No ratings available.</div>
                )}

                <h3>Top Review Tags</h3>

                {reviewData.top_sentiment_tags?.length > 0 ? (
                    <table className="patient-table">
                        <thead>
                            <tr>
                                <th>Tag</th>
                                <th>Count</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reviewData.top_sentiment_tags.map((item) => (
                                <tr key={item._id}>
                                    <td>{item._id.replaceAll("_", " ")}</td>
                                    <td>{item.count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="empty">No review tags available.</div>
                )}
            </>
        )}

        <h3>Medical Catalogs</h3>

        {!reviewsLoading && !reviewsError && catalogData.length === 0 ? (
            <div className="empty">No medical catalog documents found.</div>
        ) : (
            <div className="analytics-table-container">
                <table className="patient-table">
                    <thead>
                        <tr>
                            <th>Clinic ID</th>
                            <th>Type</th>
                            <th>Document Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        {catalogData.map((item) => (
                            <tr key={item._id}>
                                <td>{item.clinic_id}</td>
                                <td>{item.type}</td>
                                <td>
                                    <pre style={{
                                        whiteSpace: "pre-wrap",
                                        overflowWrap: "anywhere",
                                        margin: 0
                                    }}>
                                        {JSON.stringify(
                                            Object.fromEntries(
                                                Object.entries(item).filter(
                                                    ([key]) => key !== "_id"
                                                )
                                            ),
                                            null,
                                            2
                                        )}
                                    </pre>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
    </div>
)}


{view === "map" && (
    <div className="section">
        <h2>Nearby Nurses</h2>
        <p>Find active nurses within 5 km of a selected location.</p>

        <div className="form-row">
            <label>
                Latitude
                <input
                    type="number"
                    min="-90"
                    max="90"
                    step="any"
                    value={mapLatitude}
                    onChange={(e) => setMapLatitude(e.target.value)}
                />
            </label>

            <label>
                Longitude
                <input
                    type="number"
                    min="-180"
                    max="180"
                    step="any"
                    value={mapLongitude}
                    onChange={(e) => setMapLongitude(e.target.value)}
                />
            </label>
        </div>


        <p>
            Search radius: <strong>5 km</strong>
            {" · "}Auto-refresh: <strong>10 seconds</strong>
        </p>

        <p className="warning">
            Nurse locations are based on stored pings. Check each last-ping
            timestamp before treating a location as current.
        </p>

        <div style={{ margin: "20px 0" }}>
            <h3>Nurse Location Map</h3>

            <MapContainer
                key={`${mapLatitude}-${mapLongitude}`}
                center={[Number(mapLatitude), Number(mapLongitude)]}
                zoom={13}
                scrollWheelZoom={true}
                style={{
                    height: "500px",
                    width: "100%",
                    borderRadius: "12px",
                    zIndex: 0
                }}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <Circle
                    center={[Number(mapLatitude), Number(mapLongitude)]}
                    radius={5000}
                    pathOptions={{
                        color: "#2563eb",
                        fillColor: "#3b82f6",
                        fillOpacity: 0.08
                    }}
                />

                {nurseData.map((nurse) => {
                    const [longitude, latitude] =
                        nurse.location.coordinates;

                    return (
                        <CircleMarker
                            key={nurse.nurse_id}
                            center={[latitude, longitude]}
                            radius={7}
                            pathOptions={{
                                color: "#166534",
                                fillColor: "#22c55e",
                                fillOpacity: 0.9
                            }}
                        >
                            <Popup>
                                <strong>Active Nurse</strong>
                                <br />
                                ID: {nurse.nurse_id}
                                <br />
                                Distance:{" "}
                                {nurse.distance_meters >= 1000
                                    ? `${(nurse.distance_meters / 1000).toFixed(2)} km`
                                    : `${nurse.distance_meters} m`}
                                <br />
                                Last ping:{" "}
                                {new Date(nurse.created_at).toLocaleString()}
                            </Popup>
                        </CircleMarker>
                    );
                })}
            </MapContainer>

            <p>
                <span style={{ color: "#16a34a" }}>●</span>
                {" "}Active nurses
                {" · "}
                <span style={{ color: "#2563eb" }}>○</span>
                {" "}5 km search radius
            </p>
        </div>


        {mapLoading && <p>Loading nearby nurses...</p>}

        {mapError && <div className="error">{mapError}</div>}

        {!mapError && (
            <>
                <h3>Nearby nurses ({nurseData.length})</h3>

                {nurseData.length === 0 && !mapLoading ? (
                    <div className="empty">
                        No active nurses found within 5 km.
                    </div>
                ) : (
                    <div className="analytics-table-container">
                        <table className="patient-table">
                            <thead>
                                <tr>
                                    <th>Nurse ID</th>
                                    <th>Distance</th>
                                    <th>Latitude</th>
                                    <th>Longitude</th>
                                    <th>Last Ping</th>
                                </tr>
                            </thead>

                            <tbody>
                                {nurseData.map((nurse) => (
                                    <tr key={nurse.nurse_id}>
                                        <td>{nurse.nurse_id}</td>
                                        <td>
                                            {nurse.distance_meters >= 1000
                                                ? `${(
                                                    nurse.distance_meters / 1000
                                                ).toFixed(2)} km`
                                                : `${nurse.distance_meters} m`}
                                        </td>
                                        <td>
                                            {nurse.location.coordinates[1]}
                                        </td>
                                        <td>
                                            {nurse.location.coordinates[0]}
                                        </td>
                                        <td>
                                            {new Date(
                                                nurse.created_at
                                            ).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </>
        )}
    </div>
)}



        </div>
    );
}

export default App;
