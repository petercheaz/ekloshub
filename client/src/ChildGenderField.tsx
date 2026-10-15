import type { VbsRegistrationStudent } from "./types";

type GenderValue = VbsRegistrationStudent["childGender"];

export function ChildGenderField({
  value,
  onChange,
  disabled,
  name = "childGender",
}: {
  value: GenderValue;
  onChange: (next: "M" | "F") => void;
  disabled?: boolean;
  name?: string;
}) {
  return (
    <fieldset className="vbs-registration-gender" disabled={disabled}>
      <legend>Gender</legend>
      <div className="vbs-registration-gender-options">
        <label className="vbs-registration-gender-option">
          <input
            type="radio"
            name={name}
            value="M"
            required
            checked={value === "M"}
            disabled={disabled}
            onChange={() => onChange("M")}
          />
          Male (M)
        </label>
        <label className="vbs-registration-gender-option">
          <input
            type="radio"
            name={name}
            value="F"
            required
            checked={value === "F"}
            disabled={disabled}
            onChange={() => onChange("F")}
          />
          Female (F)
        </label>
      </div>
    </fieldset>
  );
}
