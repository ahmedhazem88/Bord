import { Link } from "react-router-dom";

export interface BreadcrumbItem {
  label: string;
  path?: string;
}

/** Visual breadcrumb trail. Pass the same `items` to breadcrumbJsonLd for the matching structured-data markup. */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <ol>
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`}>
              {item.path && !isLast ? (
                <Link to={item.path}>{item.label}</Link>
              ) : (
                <span aria-current={isLast ? "page" : undefined}>{item.label}</span>
              )}
              {!isLast && <span className="breadcrumb-sep" aria-hidden="true"> / </span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function breadcrumbJsonLd(items: BreadcrumbItem[], origin: string): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      ...(item.path ? { item: origin + item.path } : {}),
    })),
  };
}
