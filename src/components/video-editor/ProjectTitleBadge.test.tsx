import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProjectTitleBadge } from "./ProjectTitleBadge";
import { projectDisplayName } from "./studioTitle";

const t = (key: string, vars?: Record<string, string>) =>
	vars ? `${key}:${Object.values(vars).join(",")}` : key;

describe("ProjectTitleBadge", () => {
	it("shows the project name, unsaved marker, export progress and Studio badge", () => {
		render(
			<ProjectTitleBadge
				projectPath="/home/sam/Videos/Openscreen/recording-1_p4_done.openscreen"
				hasUnsavedChanges
				isExporting
				exportPercentage={42.7}
				isStudio
				t={t}
			/>,
		);
		expect(screen.getByText("recording-1_p4_done")).toBeInTheDocument();
		expect(screen.getByRole("img", { name: "projectTitle.unsaved" })).toBeInTheDocument();
		expect(screen.getByText("projectTitle.exportingPercent:42")).toBeInTheDocument();
		expect(screen.getByText("projectTitle.studio")).toBeInTheDocument();
	});

	it("shows nothing for an unsaved session outside Studio", () => {
		const { container } = render(
			<ProjectTitleBadge
				projectPath={null}
				hasUnsavedChanges={false}
				isExporting={false}
				isStudio={false}
				t={t}
			/>,
		);
		expect(container).toBeEmptyDOMElement();
	});
});

it("strips folders and the extension from Windows and Linux paths", () => {
	expect(projectDisplayName("C:\\Users\\x\\p1.openscreen")).toBe("p1");
	expect(projectDisplayName("/home/sam/p2b_done.openscreen")).toBe("p2b_done");
	expect(projectDisplayName(null)).toBeNull();
});
