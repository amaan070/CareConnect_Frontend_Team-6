import { Component } from "react";

// Last line of defence: if any component throws while rendering,
// show a message and a reload button instead of a blank white page.
export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { failed: false, message: "" };
    }

    static getDerivedStateFromError(error) {
        return { failed: true, message: error?.message || "" };
    }

    componentDidCatch(error, info) {
        console.error("Unhandled UI error:", error, info);
    }

    render() {
        if (!this.state.failed) return this.props.children;

        return (
            <div className="boundary">
                <div className="boundary-card" role="alert">
                    <h2>Something went wrong</h2>
                    <p>
                        The page hit an unexpected error. Your data is safe -
                        reloading usually fixes this.
                    </p>
                    {this.state.message && (
                        <pre className="boundary-detail">{this.state.message}</pre>
                    )}
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                    >
                        Reload page
                    </button>
                </div>
            </div>
        );
    }
}
